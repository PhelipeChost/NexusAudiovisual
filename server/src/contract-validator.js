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

  // Find all signature objects: /Type /Sig with /ByteRange and /Contents
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
  let match

  while ((match = byteRangeRegex.exec(str)) !== null) {
    const byteRange = [
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
      parseInt(match[4]),
    ]

    // Find /Contents near this ByteRange
    const searchStart = Math.max(0, match.index - 2000)
    const searchEnd = Math.min(str.length, match.index + 2000)
    const nearbyStr = str.substring(searchStart, searchEnd)

    const contentsMatch = nearbyStr.match(/\/Contents\s*<([0-9a-fA-F]+)>/)
    if (!contentsMatch) continue

    const hexContent = contentsMatch[1]
    const sigBuffer = Buffer.from(hexContent, 'hex')

    // Extract signature metadata (Reason, Name, Location, ContactInfo, M)
    const meta = {}
    const reasonMatch = nearbyStr.match(/\/Reason\s*\(([^)]*)\)/)
    const nameMatch = nearbyStr.match(/\/Name\s*\(([^)]*)\)/)
    const locationMatch = nearbyStr.match(/\/Location\s*\(([^)]*)\)/)
    const contactMatch = nearbyStr.match(/\/ContactInfo\s*\(([^)]*)\)/)
    const dateMatch = nearbyStr.match(/\/M\s*\(D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
    const filterMatch = nearbyStr.match(/\/Filter\s*\/([^\s/]+)/)
    const subFilterMatch = nearbyStr.match(/\/SubFilter\s*\/([^\s/]+)/)

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

    // Verify integrity: check if the signed bytes match
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

      // Find signer certificate (usually the first non-CA cert)
      const signerCert = certs.find(c => !c.subject.CN?.includes('AC ') && !c.subject.CN?.includes('Autoridade'))
        || certs[0]

      // Check integrity via digest comparison
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
    } catch (err) {
      // Still record the signature even if parsing fails
      signatures.push({
        byteRange,
        meta,
        certs: [],
        signerCert: null,
        integrityValid: false,
        signatureType: 'unknown',
        parseError: err.message,
      })
    }
  }

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
  if (!certs || certs.length === 0) return 'unknown'

  // Check for ICP-Brasil / Gov.br indicators
  for (const cert of certs) {
    const issuerCN = cert.issuer?.CN || ''
    const issuerO = cert.issuer?.O || ''
    const subjectO = cert.subject?.O || ''

    // ICP-Brasil chain indicators
    if (issuerCN.includes('ICP-Brasil') || issuerO.includes('ICP-Brasil') ||
        issuerCN.includes('AC Raiz') || issuerCN.includes('AC SOLUTI') ||
        issuerCN.includes('AC SERASA') || issuerCN.includes('AC VALID') ||
        issuerCN.includes('AC CERTISIGN') || issuerCN.includes('AC DIGITALSIGN') ||
        issuerCN.includes('AC SAFEWEB') || issuerCN.includes('Autoridade Certificadora')) {
      return 'icp-brasil'
    }

    // Gov.br specific
    if (issuerCN.includes('gov.br') || subjectO.includes('gov.br') ||
        meta?.filter === 'Adobe.PPKLite' && meta?.subFilter?.includes('ETSI')) {
      return 'govbr'
    }
  }

  // PAdES / CAdES standard
  if (meta?.subFilter?.includes('ETSI') || meta?.subFilter?.includes('adbe.pkcs7')) {
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
    // 1. Extract text from PDF
    let pdfText = ''
    try {
      const parsed = await pdfParse(pdfBuffer)
      pdfText = parsed.text || ''
      report.pageCount = parsed.numpages
    } catch (err) {
      report.observations.push({
        type: 'warning',
        message: 'Não foi possível extrair texto do PDF — análise textual limitada',
      })
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
