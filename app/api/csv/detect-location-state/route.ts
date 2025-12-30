import { NextRequest, NextResponse } from 'next/server';
import { filebrowserClient } from '@/lib/filebrowser-client';
import Papa from 'papaparse';

interface DetectRequest {
  files: Array<{ path: string; name: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: DetectRequest = await request.json();
    const { files } = body;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const uniqueStatesSet = new Set<string>();
    const uniqueLocationsSet = new Set<string>();
    const stateLocationSet = new Set<string>();
    const stateLocationCombos: Array<{ state: string; location: string }> = [];

    // Process each file
    for (const file of files) {
      try {
        // Download CSV from filebrowser
        const blob = await filebrowserClient.downloadFile(file.path);
        const text = await blob.text();

        // Parse CSV using PapaParse (same pattern as other endpoints)
        const parseResult = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
        });

        if (parseResult.errors.length > 0) {
          console.error(`CSV parsing errors in ${file.name}:`, parseResult.errors);
          continue;
        }

        const rows = parseResult.data as Record<string, string>[];
        
        // Check if state and location columns exist
        if (rows.length === 0) continue;
        
        const headers = Object.keys(rows[0] || {});
        const hasState = headers.includes('state');
        const hasLocation = headers.includes('location');

        if (!hasState && !hasLocation) {
          console.warn(`File ${file.name} does not have 'state' or 'location' columns`);
          continue;
        }

        // Extract unique states and combinations
        for (const row of rows) {
          const state = hasState ? (row.state || '').trim() : '';
          const location = hasLocation ? (row.location || '').trim() : '';

          // Only add combinations where location is present (not empty)
          // But allow state to be empty if location is present
          if (location) {
            const comboKey = `${state}|||${location}`;
            if (!stateLocationSet.has(comboKey)) {
              stateLocationSet.add(comboKey);
              stateLocationCombos.push({ state, location });
              
              // Add location to unique locations set
              uniqueLocationsSet.add(location);
              
              // Only add state to unique states if it's present in a combination with location
              if (state) {
                uniqueStatesSet.add(state);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        // Continue with other files
      }
    }

    // Convert Set to sorted array
    const uniqueStates = Array.from(uniqueStatesSet).sort();
    const uniqueLocations = Array.from(uniqueLocationsSet).sort();

    // Sort combinations by state, then location
    stateLocationCombos.sort((a, b) => {
      if (a.state !== b.state) {
        return a.state.localeCompare(b.state);
      }
      return a.location.localeCompare(b.location);
    });

    return NextResponse.json({
      uniqueStates,
      uniqueLocations,
      stateLocationCombos,
      totalFiles: files.length,
      totalStates: uniqueStates.length,
      totalLocations: uniqueLocations.length,
      totalCombinations: stateLocationCombos.length,
    });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

