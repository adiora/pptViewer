const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');

/**
 * Converts a PPT/PPTX presentation file to PDF using LibreOffice headless mode
 * @param {string} inputPath - Absolute path to uploaded .ppt/.pptx file
 * @returns {Promise<{ pdfPath: string, pageCount: number }>}
 */
async function convertToPDF(inputPath) {
  const outputDir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const expectedPdfPath = inputPath.slice(0, -ext.length) + '.pdf';

  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath
    ];

    console.log(`[CONVERT] Spawning LibreOffice: ${config.libreOfficePath} ${args.join(' ')}`);

    const child = execFile(config.libreOfficePath, args, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[CONVERT] LibreOffice conversion error:', error);
        console.error('[CONVERT] stderr:', stderr);
        return reject(new Error(`LibreOffice conversion failed: ${error.message}`));
      }

      // Verify converted PDF file exists
      fs.access(expectedPdfPath, fs.constants.F_OK, (accessErr) => {
        if (accessErr) {
          console.error('[CONVERT] Converted PDF file not found at:', expectedPdfPath);
          return reject(new Error('Converted PDF file could not be found'));
        }

        try {
          const pageCount = extractPdfPageCount(expectedPdfPath);
          console.log(`[CONVERT] Success: ${pageCount} pages extracted for ${path.basename(expectedPdfPath)}`);
          resolve({
            pdfPath: expectedPdfPath,
            pageCount: pageCount
          });
        } catch (parseErr) {
          console.warn('[CONVERT] Could not parse page count directly, defaulting to 1:', parseErr);
          resolve({
            pdfPath: expectedPdfPath,
            pageCount: 1
          });
        }
      });
    });
  });
}

/**
 * Extracts page count from a PDF file by inspecting PDF structure tags
 * @param {string} pdfPath 
 * @returns {number}
 */
function extractPdfPageCount(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfString = pdfBuffer.toString('latin1');

  // Match /Type /Page references (excluding /Type /Pages)
  const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  if (pageMatches && pageMatches.length > 0) {
    return pageMatches.length;
  }

  // Fallback: match /Count <N> in catalog /Pages dictionary
  const countMatches = pdfString.match(/\/Count\s+(\d+)/);
  if (countMatches && countMatches[1]) {
    return parseInt(countMatches[1], 10);
  }

  return 1;
}

module.exports = {
  convertToPDF,
  extractPdfPageCount
};
