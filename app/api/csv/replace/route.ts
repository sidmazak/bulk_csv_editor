import { NextRequest } from 'next/server';
import Papa from 'papaparse';
import fs from 'fs/promises';
import path from 'path';
import { saveProcessedFile, createZipFile, getDownloadUrl } from '@/lib/file-processor';
import { parseCloudStorageLink, downloadFromCloudStorage } from '@/lib/cloud-storage-client';

interface SearchResultRow {
  rowIndex: number;
  fields: Record<string, string>;
}

interface SearchResult {
  filename: string;
  path: string;
  rows: SearchResultRow[];
}

interface ReplaceRequest {
  searchResults: SearchResult[];
  selectedFiles?: Array<{ path: string; name: string; url?: string }>; // Original files with URLs
  replaceTargetField?: string; // Keep for backwards compatibility
  replaceValue?: string; // Keep for backwards compatibility
  replaceOperations?: Array<{ field: string; value: string }>; // New: multiple replacements
  saveMode: 'local';
}

interface ProcessStats {
  totalFiles: number;
  processedFiles: number;
  totalRows: number;
  processedRows: number;
  totalMatches: number;
  totalReplacements: number;
  currentFile?: string;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const body: ReplaceRequest = await request.json();
        const {
          searchResults,
          selectedFiles = [],
          replaceTargetField,
          replaceValue,
          replaceOperations,
          saveMode = 'filebrowser',
        } = body;

        if (!searchResults || searchResults.length === 0) {
          sendEvent('error', { message: 'No search results provided' });
          controller.close();
          return;
        }

        // Build replace operations array (support both old and new format)
        let operations: Array<{ field: string; value: string }> = [];
        
        if (replaceOperations && replaceOperations.length > 0) {
          // New format: multiple operations
          operations = replaceOperations;
        } else if (replaceTargetField) {
          // Old format: single field/value (backwards compatible)
          if (replaceValue === undefined || replaceValue === null) {
            sendEvent('error', {
              message: 'Replace value must be provided (empty string is allowed)',
            });
            controller.close();
            return;
          }
          operations = [{ field: replaceTargetField, value: replaceValue }];
        } else {
          sendEvent('error', {
            message: 'Either replaceOperations or replaceTargetField must be provided',
          });
          controller.close();
          return;
        }

        // Validate all operations
        for (const op of operations) {
          if (!op.field) {
            sendEvent('error', {
              message: 'All replace operations must have a field specified',
            });
            controller.close();
            return;
          }
          if (op.value === undefined || op.value === null) {
            sendEvent('error', {
              message: 'All replace operations must have a value specified (empty string is allowed)',
            });
            controller.close();
            return;
          }
        }

        // Group rows by file for efficient processing
        // Filter out files with no matching rows
        const filesMap = new Map<string, SearchResult>();
        for (const result of searchResults) {
          // Only include files that have matching rows
          if (result.rows && result.rows.length > 0) {
            filesMap.set(result.path, result);
          }
        }

        if (filesMap.size === 0) {
          sendEvent('error', { message: 'No files with matching rows found' });
          controller.close();
          return;
        }

        const stats: ProcessStats = {
          totalFiles: filesMap.size, // Only count files with matches
          processedFiles: 0,
          totalRows: 0,
          processedRows: 0,
          totalMatches: 0,
          totalReplacements: 0,
        };

        const outputFiles: Array<{ originalPath: string; newPath: string | null }> = [];

        // Process each file
        // NOTE: We are NOT re-searching. We use the search results directly.
        // We download and parse the full CSV (necessary to modify it), but only
        // replace the specific rows that were found during the search.
        for (const [filePath, searchResult] of filesMap.entries()) {
          try {
            console.log(`[REPLACE] Processing file: ${searchResult.filename}`);
            console.log(`[REPLACE] Search result has ${searchResult.rows.length} rows to replace`);
            console.log(`[REPLACE] Row indices from search:`, searchResult.rows.map(r => r.rowIndex));
            
            stats.currentFile = searchResult.filename;
            sendEvent('file-start', {
              filename: searchResult.filename,
              path: filePath,
            });

            // Get CSV content from uploaded file or cloud storage
            // First, try to find the original file from selectedFiles to get the proper URL
            let text: string;
            let actualFilePath = filePath;
            
            // Look up the original file URL from selectedFiles
            const originalFile = selectedFiles.find(
              (f) => f.name === searchResult.filename || f.path === filePath || f.path === searchResult.path
            );
            
            if (originalFile && originalFile.url) {
              actualFilePath = originalFile.url;
            }
            
            // Now handle the file based on its URL/path
            if (actualFilePath.startsWith('/api/download')) {
              // Read from tmp directory
              try {
                const url = new URL(actualFilePath, 'http://localhost');
                const fileParam = url.searchParams.get('file');
                if (fileParam) {
                  const safePath = path.normalize(fileParam).replace(/^(\.\.(\/|\\|$))+/, '');
                  const localFilePath = path.join(process.cwd(), 'tmp', safePath);
                  text = await fs.readFile(localFilePath, 'utf8');
                } else {
                  throw new Error('Invalid file URL');
                }
              } catch (urlError) {
                // If URL parsing fails, try treating as direct path
                const safePath = path.normalize(actualFilePath).replace(/^(\.\.(\/|\\|$))+/, '');
                const localFilePath = path.join(process.cwd(), 'tmp', safePath);
                text = await fs.readFile(localFilePath, 'utf8');
              }
            } else if (actualFilePath.startsWith('http://') || actualFilePath.startsWith('https://')) {
              // Handle cloud storage link
              const link = parseCloudStorageLink(actualFilePath);
              const { blob } = await downloadFromCloudStorage(link);
              text = await blob.text();
            } else {
              // Fallback: try to read as local file
              const localFilePath = path.join(process.cwd(), 'tmp', path.basename(actualFilePath));
              text = await fs.readFile(localFilePath, 'utf8');
            }

            // Parse CSV
            const parseResult = Papa.parse(text, {
              header: true,
              skipEmptyLines: true,
              transformHeader: (header) => header.trim(),
            });

            if (parseResult.errors.length > 0) {
              sendEvent('error', {
                filename: searchResult.filename,
                error: `CSV parsing errors: ${parseResult.errors
                  .map((e) => e.message)
                  .join(', ')}`,
              });
              continue;
            }

            const rows = parseResult.data as Record<string, string>[];
            // Ensure unique headers (deduplicate if Papa.parse created duplicates)
            const rawHeaders = Object.keys(rows[0] || {});
            const headers = Array.from(new Set(rawHeaders.map(h => h.trim()).filter(h => h)));
            stats.totalRows += rows.length;

            // Check if all replace operation fields exist in headers
            const invalidFields = operations
              .map((op) => op.field)
              .filter((field) => !headers.includes(field));
            
            if (invalidFields.length > 0) {
              sendEvent('error', {
                filename: searchResult.filename,
                error: `Fields not found in CSV headers: ${invalidFields.join(', ')}`,
              });
              continue;
            }

            sendEvent('file-info', {
              filename: searchResult.filename,
              totalRows: rows.length,
              fieldsToReplace: operations.length,
            });

            // Create a map of row indices that need replacement
            const rowsToReplace = new Set(
              searchResult.rows.map((r) => r.rowIndex - 1),
            ); // Convert to 0-based index

            console.log(`[REPLACE] Rows to replace (0-based):`, Array.from(rowsToReplace));
            console.log(`[REPLACE] Total rows in file: ${rows.length}`);
            console.log(`[REPLACE] Replace operations:`, operations);

            const processedRows: Record<string, string>[] = [];
            let fileReplacements = 0;

            // Process each row
            for (let i = 0; i < rows.length; i++) {
              const row = { ...rows[i] };
              const rowMatchesEvents: Array<{
                field: string;
                oldValue: string;
                newValue: string;
              }> = [];

              // Only replace if this row was in the search results
              if (rowsToReplace.has(i)) {
                console.log(`[REPLACE] Processing row ${i} (0-based, CSV row ${i + 1})`);
                // Process all replace operations for this row
                for (const op of operations) {
                  // Check if field exists in headers (should already be validated, but double-check)
                  if (!headers.includes(op.field)) {
                    console.log(`[REPLACE] Row ${i}: Field "${op.field}" not found in headers, skipping`);
                    continue; // Skip if field doesn't exist
                  }

                  const oldValue = row[op.field] ?? '';
                  const newValue = op.value;

                  if (oldValue !== newValue) {
                    console.log(`[REPLACE] Row ${i}: ${op.field} "${oldValue}" -> "${newValue}"`);
                    row[op.field] = newValue;
                    fileReplacements++;
                    stats.totalReplacements++;

                    rowMatchesEvents.push({
                      field: op.field,
                      oldValue,
                      newValue,
                    });
                  } else {
                    console.log(`[REPLACE] Row ${i}: ${op.field} value unchanged ("${oldValue}")`);
                  }
                }
              }

              processedRows.push(row);
              stats.processedRows++;

              // Send row-processed event for replaced rows
              if (rowMatchesEvents.length > 0) {
                sendEvent('row-processed', {
                  filename: searchResult.filename,
                  filePath: filePath,
                  rowIndex: i + 1,
                  totalRows: rows.length,
                  matches: rowMatchesEvents,
                });
              }

              // Send stats update every 10 rows
              if ((i + 1) % 10 === 0 || i === rows.length - 1) {
                sendEvent('stats', { ...stats });
              }
            }

            // Track file replacements (for stats, though not part of ProcessStats interface)

            // Only save if replacements were actually made
            let newPath: string | null = null;
            
            if (fileReplacements > 0) {
              console.log(`[REPLACE] File ${searchResult.filename}: ${fileReplacements} replacements made`);
              // Save the modified CSV
              const newCsv = Papa.unparse(processedRows, { header: true });

              const pathParts = filePath.split('/');
              const fileName = pathParts.pop() || 'file.csv';
              const directory = pathParts.join('/') || '/';
              const nameWithoutExt = fileName.replace(/\.csv$/i, '');
              const replacedFileName = `${nameWithoutExt}_replaced.csv`;

              // Save to tmp directory
              const filePathSaved = await saveProcessedFile(replacedFileName, newCsv);
              newPath = getDownloadUrl(filePathSaved);

              // Only count as processed if replacements were made
              stats.processedFiles++;
            } else {
              console.log(`[REPLACE] WARNING: File ${searchResult.filename}: No replacements made!`);
              console.log(`[REPLACE] Rows to replace set:`, Array.from(rowsToReplace));
              console.log(`[REPLACE] Total rows in CSV:`, rows.length);
            }

            outputFiles.push({
              originalPath: filePath,
              newPath,
            });

            stats.currentFile = undefined;

            sendEvent('file-complete', {
              filename: searchResult.filename,
              matchesCount: fileReplacements,
              replacementsCount: fileReplacements,
              newPath,
            });

            sendEvent('stats', { ...stats });
          } catch (error) {
            sendEvent('error', {
              filename: searchResult.filename,
              error:
                error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        // Create zip if multiple files, otherwise return single file URL
        let downloadUrl: string | null = null;
        let isZip = false;

        const filesWithOutput = outputFiles.filter((f: { originalPath: string; newPath: string | null }) => f.newPath);
        
        if (filesWithOutput.length > 1) {
          // Create zip file
          const filesToZip = filesWithOutput.map((f: { originalPath: string; newPath: string | null }) => {
            const filePath = path.join(process.cwd(), 'tmp', path.basename(f.newPath!));
            return {
              filename: path.basename(f.newPath!),
              filePath: filePath,
            };
          });
          
          try {
            const zipPath = await createZipFile(filesToZip);
            downloadUrl = getDownloadUrl(zipPath);
            isZip = true;
          } catch (error) {
            console.error('Failed to create zip:', error);
          }
        } else if (filesWithOutput.length === 1) {
          downloadUrl = filesWithOutput[0].newPath;
          isZip = false;
        }

        // Send complete event
        sendEvent('complete', {
          downloadUrl,
          isZip,
          stats: {
            totalFiles: stats.totalFiles,
            processedFiles: stats.processedFiles,
            totalRows: stats.totalRows,
            processedRows: stats.processedRows,
            totalMatches: stats.totalMatches,
            totalReplacements: stats.totalReplacements,
          },
        });
      } catch (error) {
        sendEvent('error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

