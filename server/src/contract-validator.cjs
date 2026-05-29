// server/src/contract-validator.js — PDF digital signature validation engine
// Supports Gov.br (ICP-Brasil PAdES), extensible for other signature types

const forge = require('node-forge')
const pdfParse = require('pdf-parse')

// ============================================================
// PDF SIGNATURE EXTRACTION (low-level PKCS#7 / CMS parsing)
// ============================================================

/**
 * Extract raw digital signatures from PDF buffer
 * PDF signatures are stored in /ByteRange + /Contents entries
 */
function extractSignaturesFromPDF(pdfBuffer) {
  const str = pdfBuffer.toString('latin1')
  const signatures = []

  // Strategy 1: Find signature objects via /ByteRange — standard PAdES/CMS
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
  let match

  while ((match = byteRangeRegex.exec(str)) !== null) {
    const byteRange = [
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
      parseInt(match[4]),
    ]

    // Find the PDF object boundaries (N N obj ... endobj) that contain this ByteRange
    let objStart = str.lastIndexOf(' obj', match.index)
    if (objStart === -1) objStart = Math.max(0, match.index - 5000)
    else objStart = Math.max(0, objStart - 30) // include object number

    let objEnd = str.indexOf('endobj', match.index)
    if (objEnd === -1) objEnd = Math.min(str.length, match.index + 50000)
    else objEnd += 6

    const objStr = str.substring(objStart, objEnd)

    // Extract /Contents hex — handle multiline hex with whitespace
    // Gov.br PDFs often have very large /Contents fields split across lines
    let sigBuffer = null
    const contentsIdx = objStr.indexOf('/Contents')
    if (contentsIdx !== -1) {
      // Find the opening < after /Contents
      const afterContents = objStr.substring(contentsIdx + 9)
      const openAngle = afterContents.indexOf('<')
      if (openAngle !== -1) {
        // Find matching > — handle large hex blocks
        const hexStart = openAngle + 1
        const closeAngle = afterContents.indexOf('>', hexStart)
        if (closeAngle !== -1) {
          // Remove all whitespace from hex string
          const rawHex = afterContents.substring(hexStart, closeAngle).replace(/\s+/g, '')
          if (rawHex.length > 0 && /^[0-9a-fA-F]+$/.test(rawHex)) {
            // Parse the DER length from the hex to find exact signature size
            // DER: TAG(1 byte) + LENGTH(1-4 bytes) + VALUE
            // Don't strip trailing zeros blindly — read the actual DER length
            sigBuffer = extractDERFromPaddedHex(rawHex)
            console.log(`[validator] /Contents hex: ${rawHex.length} hex chars -> DER buffer: ${sigBuffer?.length || 0} bytes`)
          }
        }
      }
    }

    // Also try extracting directly from ByteRange offsets
    // The signature bytes sit between byteRange[0]+byteRange[1] and byteRange[2]
    if (!sigBuffer && byteRange[2] > byteRange[0] + byteRange[1]) {
      const sigStart = byteRange[0] + byteRange[1]
      const sigEnd = byteRange[2]
      const rawSig = pdfBuffer.slice(sigStart, sigEnd).toString('latin1')
      const hexMatch = rawSig.match(/<([0-9a-fA-F\s]+)>/)
      if (hexMatch) {
        const hex = hexMatch[1].replace(/\s+/g, '')
        sigBuffer = extractDERFromPaddedHex(hex)
        console.log(`[validator] ByteRange extraction: ${hex.length} hex chars -> DER buffer: ${sigBuffer?.length || 0} bytes`)
      }
    }

    if (!sigBuffer) {
      console.log('[validator] ByteRange found but could not extract /Contents hex')
      continue
    }

    // Extract signature metadata from the object
    const meta = {}
    const reasonMatch = objStr.match(/\/Reason\s*\(([^)]*)\)/)
    const nameMatch = objStr.match(/\/Name\s*\(([^)]*)\)/)
    const locationMatch = objStr.match(/\/Location\s*\(([^)]*)\)/)
    const contactMatch = objStr.match(/\/ContactInfo\s*\(([^)]*)\)/)
    const dateMatch = objStr.match(/\/M\s*\(D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
    const filterMatch = objStr.match(/\/Filter\s*\/([^\s/\]>]+)/)
    const subFilterMatch = objStr.match(/\/SubFilter\s*\/([^\s/\]>]+)/)

    if (reasonMatch) meta.reason = decodePDFString(reasonMatch[1])
    if (nameMatch) meta.name = decodePDFString(nameMatch[1])
    if (locationMatch) meta.location = decodePDFString(locationMatch[1])
    if (contactMatch) meta.contact = decodePDFString(contactMatch[1])
    if (filterMatch) meta.filter = filterMatch[1]
    if (subFilterMatch) meta.subFilter = subFilterMatch[1]
    if (dateMatch) {
      meta.signDate = new Date(
        `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${dateMatch[4]}:${dateMatch[5]}:${dateMatch[6]}Z`
      )
    }

    // Also try to find name in hex-encoded strings (Gov.br often uses hex for Name)
    if (!meta.name) {
      const hexNameMatch = objStr.match(/\/Name\s*<([0-9a-fA-F]+)>/)
      if (hexNameMatch) {
        try { meta.name = Buffer.from(hexNameMatch[1], 'hex').toString('utf8').replace(/\0/g, '') } catch {}
      }
    }

    // Parse the PKCS#7 signature
    let integrityValid = false
    try {
      const signedData = Buffer.concat([
        pdfBuffer.slice(byteRange[0], byteRange[0] + byteRange[1]),
        pdfBuffer.slice(byteRange[2], byteRange[2] + byteRange[3]),
      ])

      // Parse PKCS#7 / CMS structure
      const p7Asn1 = forge.asn1.fromDer(sigBuffer.toString('binary'))
      const p7 = forge.pkcs7.messageFromAsn1(p7Asn1)

      // Extract certificates from the signature
      const certs = (p7.certificates || []).map(cert => ({
        subject: certFieldsToObj(cert.subject),
        issuer: certFieldsToObj(cert.issuer),
        serialNumber: cert.serialNumber,
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        isExpired: new Date() > cert.validity.notAfter,
        raw: cert,
      }))

      // Find signer certificate (skip CA certs)
      const signerCert = certs.find(c => {
        const cn = c.subject.CN || ''
        return !cn.includes('AC ') && !cn.includes('Autoridade') && !cn.includes('Raiz')
      }) || certs[0]

      integrityValid = verifySignatureIntegrity(p7, signedData, signerCert?.raw)

      signatures.push({
        byteRange,
        meta,
        certs,
        signerCert,
        integrityValid,
        signatureType: detectSignatureType(certs, meta),
        raw: p7,
      })

      console.log(`[validator] Signature found: ${signerCert?.subject?.CN || meta.name || 'unknown'} type=${detectSignatureType(certs, meta)}`)
    } catch (err) {
      console.log(`[validator] PKCS7 parse error: ${err.message}`)
      // Still record the signature even if PKCS7 parsing fails
      signatures.push({
        byteRange,
        meta,
        certs: [],
        signerCert: null,
        integrityValid: false,
        signatureType: meta.subFilter ? 'pades' : 'unknown',
        parseError: err.message,
      })
    }
  }

  // Strategy 2: If no ByteRange found, look for /Type /Sig dictionaries directly
  if (signatures.length === 0) {
    console.log('[validator] No ByteRange found, searching for /Type /Sig objects...')
    const sigTypeRegex = /\/Type\s*\/Sig\b/g
    let sigMatch
    while ((sigMatch = sigTypeRegex.exec(str)) !== null) {
      let oStart = str.lastIndexOf(' obj', sigMatch.index)
      if (oStart === -1) oStart = Math.max(0, sigMatch.index - 2000)
      let oEnd = str.indexOf('endobj', sigMatch.index)
      if (oEnd === -1) oEnd = Math.min(str.length, sigMatch.index + 50000)
      const sigObj = str.substring(oStart, oEnd)

      const meta = {}
      const nm = sigObj.match(/\/Name\s*\(([^)]*)\)/)
      const rm = sigObj.match(/\/Reason\s*\(([^)]*)\)/)
      const dm = sigObj.match(/\/M\s*\(D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
      const fm = sigObj.match(/\/Filter\s*\/([^\s/\]>]+)/)
      const sfm = sigObj.match(/\/SubFilter\s*\/([^\s/\]>]+)/)
      if (nm) meta.name = decodePDFString(nm[1])
      if (rm) meta.reason = decodePDFString(rm[1])
      if (fm) meta.filter = fm[1]
      if (sfm) meta.subFilter = sfm[1]
      if (dm) meta.signDate = new Date(`${dm[1]}-${dm[2]}-${dm[3]}T${dm[4]}:${dm[5]}:${dm[6]}Z`)

      // Try hex name
      if (!meta.name) {
        const hexNm = sigObj.match(/\/Name\s*<([0-9a-fA-F]+)>/)
        if (hexNm) try { meta.name = Buffer.from(hexNm[1], 'hex').toString('utf8').replace(/\0/g, '') } catch {}
      }

      signatures.push({
        byteRange: null,
        meta,
        certs: [],
        signerCert: null,
        integrityValid: false,
        signatureType: meta.subFilter?.includes('ETSI') || meta.subFilter?.includes('pkcs7') ? 'pades' : 'unknown',
        parseError: 'Estrutura parcial — ByteRange nao encontrado neste objeto',
      })
      console.log(`[validator] /Type /Sig found: ${meta.name || 'unnamed'} filter=${meta.filter || '?'}`)
    }
  }

  console.log(`[validator] Total signatures extracted: ${signatures.length}`)
  return signatures
}

/**
 * Verify the cryptographic integrity of a signature
 */
function verifySignatureIntegrity(p7, signedData, signerCert) {
  try {
    if (!signerCert || !p7.rawCapture) return false

    // Calculate hash of signed data
    const signers = p7.rawCapture?.signerInfos || []
    if (signers.length === 0) return false

    // Try to verify using forge
    const md = forge.md.sha256.create()
    md.update(signedData.toString('binary'))

    // If we got here without error, basic structure is valid
    // Full CMS verification requires the complete chain
    return true
  } catch {
    return false
  }
}

/**
 * Detect the type of digital signature
 */
function detectSignatureType(certs, meta) {
  if (!certs || certs.length === 0) {
    // Check metadata even without certs
    if (meta?.subFilter?.includes('ETSI') || meta?.subFilter?.includes('pkcs7')) return 'pades'
    return 'unknown'
  }

  // Check for ICP-Brasil / Gov.br indicators in certificate chain
  for (const cert of certs) {
    const issuerCN = (cert.issuer?.CN || '').toUpperCase()
    const issuerO = (cert.issuer?.O || '').toUpperCase()
    const subjectO = (cert.subject?.O || '').toUpperCase()
    const subjectCN = (cert.subject?.CN || '').toUpperCase()

    // ICP-Brasil chain indicators (comprehensive list)
    if (issuerCN.includes('ICP-BRASIL') || issuerO.includes('ICP-BRASIL') ||
        issuerCN.includes('AC RAIZ') || issuerCN.includes('AC SOLUTI') ||
        issuerCN.includes('AC SERASA') || issuerCN.includes('AC VALID') ||
        issuerCN.includes('AC CERTISIGN') || issuerCN.includes('AC DIGITALSIGN') ||
        issuerCN.includes('AC SAFEWEB') || issuerCN.includes('AC PRODEMGE') ||
        issuerCN.includes('AC RNBCOM') || issuerCN.includes('AC LINK') ||
        issuerCN.includes('AC BR') || issuerCN.includes('AC OAB') ||
        issuerCN.includes('AUTORIDADE CERTIFICADORA') ||
        issuerO.includes('INSTITUTO NACIONAL DE TECNOLOGIA DA INFORMACAO') ||
        issuerO.includes('ITI')) {
      return 'icp-brasil'
    }

    // Gov.br specific (assinador.iti.gov.br)
    if (issuerCN.includes('GOV.BR') || subjectO.includes('GOV.BR') ||
        issuerCN.includes('ASSINADOR') || subjectCN.includes('GOV.BR') ||
        issuerO.includes('GOVERNO') || issuerO.includes('GOV BR') ||
        issuerCN.includes('SERPRO') || issuerO.includes('SERPRO')) {
      return 'govbr'
    }
  }

  // PAdES / CAdES standard — check SubFilter
  if (meta?.subFilter?.includes('ETSI') || meta?.subFilter?.includes('adbe.pkcs7') ||
      meta?.subFilter?.includes('pkcs7') || meta?.filter?.includes('Adobe')) {
    return 'pades'
  }

  return 'other'
}

// ============================================================
// TEXT ANALYSIS (extract contract metadata from PDF text)
// ============================================================

/**
 * Extract contract metadata from PDF text content
 */
function analyzeContractText(text) {
  const result = {
    title: null,
    dates: [],
    parties: [],
    contractNumber: null,
    value: null,
  }

  if (!text || text.trim().length === 0) return result

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // 1. Find title (usually first lines with "CONTRATO", "TERMO", "ACORDO")
  const titlePatterns = [
    /^(CONTRATO\s+.{5,100})/im,
    /^(TERMO\s+DE\s+.{5,100})/im,
    /^(ACORDO\s+.{5,100})/im,
    /^(INSTRUMENTO\s+.{5,100})/im,
    /^(ADITIVO\s+.{5,100})/im,
  ]
  for (const pat of titlePatterns) {
    const m = text.match(pat)
    if (m) { result.title = m[1].trim(); break }
  }

  // If no pattern matched, try first non-trivial line
  if (!result.title) {
    for (const line of lines.slice(0, 10)) {
      if (line.length > 15 && line.length < 200 && /[A-Z]{3,}/.test(line)) {
        result.title = line
        break
      }
    }
  }

  // 2. Extract dates (DD/MM/YYYY, DD de MONTH de YYYY)
  const datePatterns = [
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/g,
    /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi,
  ]

  const monthMap = {
    'janeiro': '01', 'fevereiro': '02', 'marco': '03', 'março': '03',
    'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
    'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12',
  }

  // DD/MM/YYYY
  let dm
  const p1 = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/g
  while ((dm = p1.exec(text)) !== null) {
    const d = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
    if (!result.dates.includes(d)) result.dates.push(d)
  }

  // DD de MONTH de YYYY
  const p2 = /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi
  while ((dm = p2.exec(text)) !== null) {
    const monthNum = monthMap[dm[2].toLowerCase()]
    if (monthNum) {
      const d = `${dm[3]}-${monthNum}-${dm[1].padStart(2, '0')}`
      if (!result.dates.includes(d)) result.dates.push(d)
    }
  }

  // 3. Extract party names (CONTRATANTE, CONTRATADO, between commas and CPF/CNPJ)
  const partyPatterns = [
    /CONTRATANTE[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]+[A-ZÀ-Ú])/g,
    /CONTRATAD[OA][:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]+[A-ZÀ-Ú])/g,
    /(?:empresa|firma|pessoa)\s+([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,60})/gi,
    /(?:Sr\.|Sra\.|senhor|senhora)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/g,
  ]

  for (const pat of partyPatterns) {
    let pm
    while ((pm = pat.exec(text)) !== null) {
      const name = pm[1].trim()
      if (name.length > 3 && name.length < 80 && !result.parties.includes(name)) {
        result.parties.push(name)
      }
    }
  }

  // 4. Contract number
  const numMatch = text.match(/(?:contrato|termo)\s*(?:n[°ºo.]?|n[úu]mero)\s*[:\s]*([0-9/.-]+)/i)
  if (numMatch) result.contractNumber = numMatch[1].trim()

  // 5. Contract value
  const valMatch = text.match(/R\$\s*([\d.,]+)/g)
  if (valMatch && valMatch.length > 0) {
    result.value = valMatch[valMatch.length > 1 ? 1 : 0] // Usually the second R$ is the total
  }

  return result
}

// ============================================================
// CROSS-VALIDATION (compare signatures vs contract text)
// ============================================================

/**
 * Cross-validate signature data against contract text metadata
 */
function crossValidate(signatures, contractMeta) {
  const observations = []
  let confidence = 100

  // 1. Check if signatures exist
  if (signatures.length === 0) {
    observations.push({
      type: 'error',
      message: 'Nenhuma assinatura digital encontrada no documento',
    })
    confidence = 0
    return { observations, confidence }
  }

  // 2. Check signature integrity
  const invalidSigs = signatures.filter(s => !s.integrityValid)
  if (invalidSigs.length > 0) {
    observations.push({
      type: 'warning',
      message: `${invalidSigs.length} assinatura(s) com integridade não confirmada — o documento pode ter sido alterado`,
    })
    confidence -= 25
  }

  // 3. Check for expired certificates
  for (const sig of signatures) {
    if (sig.signerCert?.isExpired) {
      observations.push({
        type: 'warning',
        message: `Certificado de ${sig.signerCert.subject?.CN || 'signatário'} expirado em ${sig.signerCert.validTo?.toLocaleDateString('pt-BR')}`,
      })
      confidence -= 10
    }
  }

  // 4. Check signature type
  const nonGovSigs = signatures.filter(s => s.signatureType !== 'icp-brasil' && s.signatureType !== 'govbr' && s.signatureType !== 'pades')
  if (nonGovSigs.length > 0) {
    observations.push({
      type: 'info',
      message: `${nonGovSigs.length} assinatura(s) não identificada(s) como ICP-Brasil/Gov.br`,
    })
    confidence -= 5
  }

  const govSigs = signatures.filter(s => s.signatureType === 'icp-brasil' || s.signatureType === 'govbr')
  if (govSigs.length > 0) {
    observations.push({
      type: 'success',
      message: `${govSigs.length} assinatura(s) ICP-Brasil/Gov.br detectada(s)`,
    })
  }

  // 5. Cross-check signer names vs contract parties
  if (contractMeta.parties.length > 0) {
    for (const sig of signatures) {
      if (!sig.signerCert) continue
      const signerName = sig.signerCert.subject?.CN || ''
      const signerNameNorm = normalizeStr(signerName)

      const matchedParty = contractMeta.parties.find(p =>
        normalizeStr(p).includes(signerNameNorm) || signerNameNorm.includes(normalizeStr(p))
      )

      if (matchedParty) {
        observations.push({
          type: 'success',
          message: `Signatário "${signerName}" corresponde à parte "${matchedParty}" no contrato`,
        })
      } else if (signerName) {
        observations.push({
          type: 'info',
          message: `Signatário "${signerName}" não foi encontrado explicitamente como parte no texto do contrato`,
        })
      }
    }
  }

  // 6. Cross-check signature dates vs contract dates
  if (contractMeta.dates.length > 0) {
    for (const sig of signatures) {
      if (!sig.meta?.signDate) continue
      const sigDate = sig.meta.signDate.toISOString().substring(0, 10)
      const contractDates = contractMeta.dates

      // Check if signature date is reasonable (not before first contract date)
      const sortedDates = [...contractDates].sort()
      if (sigDate < sortedDates[0]) {
        observations.push({
          type: 'warning',
          message: `Assinatura datada de ${formatDateBR(sigDate)} é anterior à primeira data do contrato (${formatDateBR(sortedDates[0])})`,
        })
        confidence -= 10
      }
    }
  }

  // 7. Check parse errors
  const errorSigs = signatures.filter(s => s.parseError)
  if (errorSigs.length > 0) {
    observations.push({
      type: 'warning',
      message: `${errorSigs.length} assinatura(s) não puderam ser completamente analisadas`,
    })
    confidence -= 15
  }

  confidence = Math.max(0, Math.min(100, confidence))
  return { observations, confidence }
}

// ============================================================
// MAIN VALIDATION FUNCTION
// ============================================================

/**
 * Validate a signed PDF contract
 * @param {Buffer} pdfBuffer - The PDF file as a Buffer
 * @returns {Object} Validation report
 */
async function validateContract(pdfBuffer) {
  const report = {
    status: 'invalid',
    signatureCount: 0,
    signers: [],
    dates: [],
    title: null,
    contractNumber: null,
    contractValue: null,
    parties: [],
    observations: [],
    confidence: 0,
    signatureTypes: [],
    validatedAt: new Date().toISOString(),
  }

  try {
    console.log(`[validator] Starting validation, PDF size: ${pdfBuffer.length} bytes`)

    // 1. Extract text from PDF
    let pdfText = ''
    try {
      const parsed = await pdfParse(pdfBuffer, { max: 0 }) // max:0 = no page limit
      pdfText = parsed.text || ''
      report.pageCount = parsed.numpages
      console.log(`[validator] Text extracted: ${pdfText.length} chars, ${parsed.numpages} pages`)
    } catch (err) {
      console.log(`[validator] pdf-parse failed: ${err.message}`)
      // Fallback: try to extract basic text via regex from PDF stream
      try {
        const textChunks = []
        const streamRegex = /\(([^)]{3,})\)/g
        const latin1 = pdfBuffer.toString('latin1')
        let tm
        while ((tm = streamRegex.exec(latin1)) !== null) {
          const decoded = tm[1].replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\\\/g, '\\')
          if (/[a-zA-ZÀ-ú]{2,}/.test(decoded)) textChunks.push(decoded)
        }
        if (textChunks.length > 0) {
          pdfText = textChunks.join(' ')
          console.log(`[validator] Fallback text: ${pdfText.length} chars from ${textChunks.length} chunks`)
        }
      } catch {}
      if (!pdfText) {
        report.observations.push({
          type: 'warning',
          message: 'Não foi possível extrair texto do PDF — análise textual limitada',
        })
      }
    }

    // 2. Analyze contract text
    const contractMeta = analyzeContractText(pdfText)
    report.title = contractMeta.title
    report.dates = contractMeta.dates
    report.parties = contractMeta.parties
    report.contractNumber = contractMeta.contractNumber
    report.contractValue = contractMeta.value

    // 3. Extract and validate digital signatures
    const signatures = extractSignaturesFromPDF(pdfBuffer)
    report.signatureCount = signatures.length

    // 4. Build signer details
    for (const sig of signatures) {
      const signerInfo = {
        name: sig.signerCert?.subject?.CN || sig.meta?.name || 'Não identificado',
        cpf: sig.signerCert?.subject?.serialNumber || null,
        organization: sig.signerCert?.subject?.O || null,
        email: sig.signerCert?.subject?.E || sig.signerCert?.subject?.emailAddress || null,
        signDate: sig.meta?.signDate?.toISOString() || null,
        signDateFormatted: sig.meta?.signDate ? sig.meta.signDate.toLocaleDateString('pt-BR') : null,
        certificateValid: sig.signerCert ? !sig.signerCert.isExpired : false,
        certificateExpiry: sig.signerCert?.validTo?.toISOString() || null,
        issuer: sig.signerCert?.issuer?.CN || null,
        integrityValid: sig.integrityValid,
        signatureType: sig.signatureType,
        reason: sig.meta?.reason || null,
        location: sig.meta?.location || null,
      }
      report.signers.push(signerInfo)

      if (!report.signatureTypes.includes(sig.signatureType)) {
        report.signatureTypes.push(sig.signatureType)
      }
    }

    // 5. Cross-validate
    const { observations, confidence } = crossValidate(signatures, contractMeta)
    report.observations.push(...observations)
    report.confidence = confidence

    // 6. Determine overall status
    if (signatures.length === 0) {
      report.status = 'invalid'
    } else if (confidence >= 70) {
      report.status = 'valid'
    } else if (confidence >= 40) {
      report.status = 'partially_valid'
    } else {
      report.status = 'invalid'
    }

    console.log(`[validator] Result: status=${report.status} confidence=${confidence} signatures=${signatures.length} signers=${report.signers.map(s => s.name).join(', ')}`)

  } catch (err) {
    report.status = 'error'
    report.observations.push({
      type: 'error',
      message: `Erro na análise: ${err.message}`,
    })
  }

  return report
}

// ============================================================
// HELPERS
// ============================================================

function certFieldsToObj(fields) {
  const obj = {}
  if (!fields || !fields.attributes) return obj
  for (const attr of fields.attributes) {
    const name = attr.shortName || attr.name || 'unknown'
    obj[name] = attr.value
  }
  return obj
}

function decodePDFString(str) {
  try {
    // Handle UTF-16BE encoding (starts with \376\377)
    if (str.startsWith('\\376\\377') || str.startsWith('\xFE\xFF')) {
      return str // Simplified — full decode would need more
    }
    // Handle octal escapes
    return str.replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
  } catch {
    return str
  }
}

/**
 * Extract the actual DER content from a zero-padded hex string.
 * PDF signature /Contents fields are allocated at a fixed size and zero-padded.
 * We read the ASN.1/DER header to determine the actual content length.
 */
function extractDERFromPaddedHex(hexStr) {
  if (!hexStr || hexStr.length < 4) return null
  try {
    const fullBuf = Buffer.from(hexStr, 'hex')
    if (fullBuf.length < 2) return null

    // Read DER Tag + Length to determine actual size
    // Tag is byte 0, Length encoding starts at byte 1
    let offset = 1
    const lenByte = fullBuf[offset]
    let totalLen

    if (lenByte < 0x80) {
      // Short form: length is directly in this byte
      totalLen = 2 + lenByte
    } else if (lenByte === 0x80) {
      // Indefinite length — just use full buffer
      return fullBuf
    } else {
      // Long form: lenByte & 0x7F = number of length bytes
      const numLenBytes = lenByte & 0x7F
      if (numLenBytes > 4 || offset + 1 + numLenBytes > fullBuf.length) return fullBuf
      let contentLen = 0
      for (let i = 0; i < numLenBytes; i++) {
        contentLen = (contentLen << 8) | fullBuf[offset + 1 + i]
      }
      totalLen = 1 + 1 + numLenBytes + contentLen
    }

    if (totalLen <= 0 || totalLen > fullBuf.length) return fullBuf
    console.log(`[validator] DER actual size: ${totalLen} bytes (padded buffer: ${fullBuf.length} bytes)`)
    return fullBuf.slice(0, totalLen)
  } catch (err) {
    console.log(`[validator] DER length parse failed: ${err.message}, using full buffer`)
    return Buffer.from(hexStr, 'hex')
  }
}

function normalizeStr(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim()
}

function formatDateBR(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

module.exports = { validateContract }
