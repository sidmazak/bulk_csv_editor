import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import fs from 'fs/promises';
import path from 'path';
import { parseCloudStorageLink, downloadFromCloudStorage } from '@/lib/cloud-storage-client';

interface HeadersRequest {
  files: Array<{ path: string; name: string; url?: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: HeadersRequest = await request.json();
    const { files } = body;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const allHeaders = new Set<string>();

    // Process each file to extract headers
    for (const file of files) {
      try {
        let text: string;

        if (file.url) {
          // Check if it's a local uploaded file (starts with /api/download)
          if (file.url.startsWith('/api/download')) {
            // Read from tmp directory
            const url = new URL(file.url, 'http://localhost');
            const fileParam = url.searchParams.get('file');
            if (fileParam) {
              const safePath = path.normalize(fileParam).replace(/^(\.\.(\/|\\|$))+/, '');
              const filePath = path.join(process.cwd(), 'tmp', safePath);
              text = await fs.readFile(filePath, 'utf8');
            } else {
              throw new Error('Invalid file URL');
            }
          } else {
            // Handle cloud storage link
            const link = parseCloudStorageLink(file.url);
            const { blob } = await downloadFromCloudStorage(link);
            text = await blob.text();
          }
        } else {
          throw new Error('File must have a url');
        }

        // Parse only the first few lines to get headers (more efficient)
        const lines = text.split('\n').slice(0, 2); // Get first 2 lines (header + 1 data row)
        const sampleText = lines.join('\n');

        const parseResult = Papa.parse(sampleText, {
          header: true,
          skipEmptyLines: false,
          transformHeader: (header) => header.trim(),
          preview: 1, // Only parse first row after header
        });

        if (parseResult.meta.fields && parseResult.meta.fields.length > 0) {
          // Ensure unique headers (Papa.parse may include duplicates)
          const uniqueFields = new Set<string>();
          parseResult.meta.fields.forEach((field) => {
            if (field && field.trim()) {
              uniqueFields.add(field.trim());
            }
          });
          uniqueFields.forEach((field) => allHeaders.add(field));
        }
      } catch (error) {
        console.error(`Error extracting headers from ${file.name}:`, error);
        // Continue with other files even if one fails
      }
    }

    return NextResponse.json({
      headers: Array.from(allHeaders).sort(),
    });
  } catch (error) {
    console.error('Error in headers endpoint:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

