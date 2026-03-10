/**
 * NCBI Datasets API v2
 * Fetches genomic assembly metadata, sizes, and sequencing completion.
 */

const NCBI_BASE = 'https://api.ncbi.nlm.nih.gov/datasets/v2'

export async function fetchNCBIGenome(scientificName) {
  try {
    // Search for genome data by taxon name
    const res = await fetch(
      `${NCBI_BASE}/genome/taxon/${encodeURIComponent(scientificName)}/dataset_report?page_size=1`,
      {
        headers: { 'Accept': 'application/json' }
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const report = data.reports?.[0]
    if (!report) return null

    const assembly = report.assembly_info
    const stats = report.assembly_stats

    return {
      assemblyName: assembly?.assembly_name,
      accession: assembly?.assembly_accession,
      level: assembly?.assembly_level, // Complete Genome, Chromosome, Scaffold, Contig
      submissionDate: assembly?.submission_date,
      totalLength: stats?.total_sequence_length,
      gcCount: stats?.total_gc_content,
      isSequenced: true,
      ncbiUrl: `https://www.ncbi.nlm.nih.gov/datasets/genome/${assembly?.assembly_accession}/`
    }
  } catch (err) {
    console.warn('NCBI fetch failed:', err)
    return null
  }
}

export function formatGenomeSize(bytes) {
  if (!bytes) return null
  const num = parseInt(bytes)
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)} Gb`
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)} Mb`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)} Kb`
  return `${num} bp`
}
