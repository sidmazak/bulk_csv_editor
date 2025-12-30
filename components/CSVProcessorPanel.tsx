'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, Replace, Loader2, ChevronDown, ChevronRight, Info, Download } from 'lucide-react';
import { toast } from 'sonner';

// Fields will be detected dynamically from CSV files

interface ProcessStats {
  totalFiles: number;
  processedFiles: number;
  totalRows: number;
  processedRows: number;
  totalMatches: number;
  totalReplacements: number;
  currentFile?: string;
}

type SaveMode = 'local';

interface FileResultRow {
  rowIndex: number;
  fields: Record<string, string>;
}

interface FileResult {
  filename: string;
  path: string;
  matches: number;
  rows: FileResultRow[];
}

interface CSVProcessorPanelProps {
  selectedFiles: Array<{ path: string; name: string; url?: string }>;
}

type MatchMode = 'contains' | 'equals' | 'regex' | 'startsWith' | 'endsWith';
type AdvancedLogic = 'AND' | 'OR';

interface FieldCondition {
  id: string;
  field: string;
  value: string;
  mode: MatchMode;
}

interface ReplaceCondition {
  id: string;
  field: string;
  value: string;
}

export function CSVProcessorPanel({ selectedFiles }: CSVProcessorPanelProps) {
  const [searchTerm, setSearchTerm] = useState(''); // kept for compatibility, not used in advanced mode
  const [replaceTerm, setReplaceTerm] = useState('');
  const [showOnlyMatches, setShowOnlyMatches] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [stats, setStats] = useState<ProcessStats | null>(null);
  const [fileResults, setFileResults] = useState<Map<string, FileResult>>(
    new Map(),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [saveMode, setSaveMode] = useState<SaveMode>('local');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [conditions, setConditions] = useState<FieldCondition[]>([]);
  const [advancedLogic, setAdvancedLogic] = useState<AdvancedLogic>('AND');
  const [replaceTargetField, setReplaceTargetField] = useState<string | undefined>();
  const [replaceConditions, setReplaceConditions] = useState<ReplaceCondition[]>([]);
  const [lastAdvancedConfig, setLastAdvancedConfig] = useState<{
    conditions: FieldCondition[];
    logic: AdvancedLogic;
    caseSensitive: boolean;
  } | null>(null);
  const [hasSearchResults, setHasSearchResults] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [fieldFilter, setFieldFilter] = useState<string>('All');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isZip, setIsZip] = useState(false);
  const [lastOperationType, setLastOperationType] = useState<'search' | 'replace' | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Use ref to track operation type (avoids React state closure issues)
  const operationTypeRef = useRef<'search' | 'replace' | null>(null);
  const [activeTab, setActiveTab] = useState('find-replace');
  // Dynamic field detection
  const [detectedFields, setDetectedFields] = useState<string[]>(['All']);
  // Checkbox selection for rows and files
  const [selectedRows, setSelectedRows] = useState<Map<string, Set<number>>>(new Map()); // filename -> Set of row indices
  const [selectedFilesForReplace, setSelectedFilesForReplace] = useState<Set<string>>(new Set()); // Set of selected filenames

  // Fetch headers from uploaded files immediately when files are selected
  useEffect(() => {
    const fetchHeaders = async () => {
      if (selectedFiles.length === 0) {
        setDetectedFields(['All']);
        return;
      }

      try {
        const response = await fetch('/api/csv/headers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            files: selectedFiles,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch headers');
        }

        const data = await response.json();
        if (data.headers && data.headers.length > 0) {
          setDetectedFields(['All', ...data.headers]);
        } else {
          setDetectedFields(['All']);
        }
      } catch (error) {
        console.error('Error fetching headers:', error);
        // Keep default if fetch fails
        setDetectedFields(['All']);
      }
    };

    fetchHeaders();
  }, [selectedFiles]); // Run when selectedFiles changes

  // Merge fields from search results with initially detected fields
  useEffect(() => {
    // Only merge if we have search results
    if (fileResults.size === 0) {
      return; // Don't update if no search results yet
    }

    const allFields = new Set<string>();
    
    // First, add fields from already detected headers (use current state)
    const currentFields = detectedFields.slice(1);
    currentFields.forEach((field) => allFields.add(field));
    
    // Then, extract fields from search results
    fileResults.forEach((fileResult) => {
      fileResult.rows.forEach((row) => {
        Object.keys(row.fields).forEach((field) => allFields.add(field));
      });
    });
    
    // Update detected fields with merged set (only if there are changes)
    if (allFields.size > 0) {
      const sortedFields = Array.from(allFields).sort();
      const newFields = ['All', ...sortedFields];
      // Only update if different to avoid infinite loops
      if (JSON.stringify(newFields) !== JSON.stringify(detectedFields)) {
        setDetectedFields(newFields);
      }
    }
  }, [fileResults]); // Only depend on fileResults - headers are set by the first useEffect

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        field: detectedFields.length > 1 ? detectedFields[1] : 'All',
        value: '',
        mode: 'contains',
      },
    ]);
  };

  const updateCondition = (id: string, patch: Partial<FieldCondition>) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };

  const removeCondition = (id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const addReplaceCondition = () => {
    setReplaceConditions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        field: detectedFields.length > 1 ? detectedFields[1] : 'All',
        value: '',
      },
    ]);
  };

  const updateReplaceCondition = (id: string, patch: Partial<ReplaceCondition>) => {
    setReplaceConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };

  const removeReplaceCondition = (id: string) => {
    setReplaceConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const startReplace = async () => {
    // Filter out invalid conditions
    const activeReplaceConditions = replaceConditions.filter(
      (cond) => cond.field && cond.value !== undefined && cond.value !== null
    );

    if (activeReplaceConditions.length === 0) {
      toast.error('Please add at least one replace condition with a field and value');
      return;
    }

    if (fileResults.size === 0 || !hasSearchResults) {
      toast.error('No search results found. Please run a search first.');
      return;
    }

    setIsProcessing(true);
    setIsReplacing(true);
    operationTypeRef.current = 'replace'; // Track operation type
    setStats(null);
    setCurrentFileName('');

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      console.log('[REPLACE] Starting replace operation');
      console.log('[REPLACE] Selected files:', Array.from(selectedFilesForReplace));
      console.log('[REPLACE] Selected rows per file:', 
        Array.from(selectedRows.entries()).map(([file, rows]) => [file, Array.from(rows)]));
      console.log('[REPLACE] Total fileResults:', fileResults.size);
      
      // Convert fileResults to API format - filter by selected files and rows
      // If no files/rows are selected, use all files/rows (backward compatibility)
      const filteredResults = Array.from(fileResults.values())
        .filter((fileResult) => {
          // If file selection is enabled, only include selected files
          // If no files are selected, include all files with matches
          if (selectedFilesForReplace.size > 0 && !selectedFilesForReplace.has(fileResult.filename)) {
            return false;
          }
          return fileResult.rows.length > 0;
        })
        .map((fileResult) => {
          const selectedRowIndices = selectedRows.get(fileResult.filename) || new Set();
          // If rows are selected for this file, filter to only those rows
          // If no rows are selected for this file, use all rows
          const filteredRows = selectedRowIndices.size > 0
            ? fileResult.rows.filter((row) => selectedRowIndices.has(row.rowIndex))
            : fileResult.rows;
          
          return {
            filename: fileResult.filename,
            path: fileResult.path,
            rows: filteredRows.map((row) => ({
              rowIndex: row.rowIndex,
              fields: row.fields,
            })),
          };
        });

      if (filteredResults.length === 0) {
        toast.error('No files or rows selected for replacement. Please select files/rows or run a search first.');
        setIsProcessing(false);
        setIsReplacing(false);
        operationTypeRef.current = null;
        return;
      }

      // Build replace operations array
      const replaceOperations: Array<{ field: string; value: string }> = [];
      
      for (const cond of activeReplaceConditions) {
        const actualValue = cond.value.trim().toLowerCase() === 'empty' ? '' : cond.value;
        replaceOperations.push({
          field: cond.field,
          value: actualValue,
        });
      }

      const payload = {
        searchResults: filteredResults,
        selectedFiles: selectedFiles, // Pass original files with URLs
        replaceOperations,
        saveMode,
      };

      const response = await fetch('/api/csv/replace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process remaining buffer - must handle both event: and data: lines
          let completeEventProcessed = false;
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            let tempEventType = currentEventType;
            
            for (const line of lines) {
              const trimmed = line.trim();
              
              if (trimmed === '') {
                // Empty line - event block complete, reset
                tempEventType = '';
                continue;
              }
              
              if (line.startsWith('event: ')) {
                tempEventType = line.substring(7).trim();
                if (tempEventType === 'complete') {
                  completeEventProcessed = true;
                }
              } else if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  handleEvent(tempEventType, data);
                } catch (e) {
                  console.error('Failed to parse event data:', e);
                }
              }
            }
          }
          // Only reset if complete event wasn't processed (it handles its own state reset)
          if (!completeEventProcessed) {
            setIsProcessing(false);
            setIsReplacing(false);
            operationTypeRef.current = null;
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed === '') {
            // Empty line - event block complete, reset
            currentEventType = '';
            continue;
          }

          if (line.startsWith('event: ')) {
            currentEventType = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              handleEvent(currentEventType, data);
            } catch (e) {
              console.error('Failed to parse event data:', e, line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Replace error:', error);
      setIsProcessing(false);
      setIsReplacing(false);
      operationTypeRef.current = null;
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const startProcessing = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    const isAdvanced = conditions.length > 0;

    if (!isAdvanced) {
      toast.error('Add at least one advanced search condition');
      return;
    }

    setIsProcessing(true);
    setIsReplacing(false);
    operationTypeRef.current = 'search'; // Track operation type
    setLastOperationType(null); // Clear last operation type
    setDownloadUrl(null); // Clear download URL for new search
    setIsZip(false);
    setStats(null);
    setCurrentFileName('');

    // clear previous results and remember config
    setFileResults(new Map());
    setExpandedFiles(new Set());
    setHasSearchResults(false);
    setLastAdvancedConfig({
      conditions: [...conditions],
      logic: advancedLogic,
      caseSensitive,
    });

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const payload: any = {
        files: selectedFiles,
        showOnlyMatches,
        saveMode: 'local',
        advanced: {
          conditions: conditions.map(({ field, value, mode }) => ({
            field,
            value,
            mode,
          })),
          logic: advancedLogic,
          caseSensitive,
        },
      };

      const response = await fetch('/api/csv/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process remaining buffer - must handle both event: and data: lines
          let completeEventProcessed = false;
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            let tempEventType = currentEventType;
            
            for (const line of lines) {
              const trimmed = line.trim();
              
              if (trimmed === '') {
                // Empty line - event block complete, reset
                tempEventType = '';
                continue;
              }
              
              if (line.startsWith('event: ')) {
                tempEventType = line.substring(7).trim();
                if (tempEventType === 'complete') {
                  completeEventProcessed = true;
                }
              } else if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  handleEvent(tempEventType, data);
                } catch (e) {
                  console.error('Failed to parse event data:', e);
                }
              }
            }
          }
          // Only reset if complete event wasn't processed (it handles its own state reset)
          if (!completeEventProcessed) {
            setIsProcessing(false);
            operationTypeRef.current = null;
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed === '') {
            // Empty line - event block complete, reset
            currentEventType = '';
            continue;
          }

          if (line.startsWith('event: ')) {
            currentEventType = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              handleEvent(currentEventType, data);
            } catch (e) {
              console.error('Failed to parse event data:', e, line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Processing error:', error);
      setIsProcessing(false);
      operationTypeRef.current = null;
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleEvent = (eventType: string, data: any) => {
    switch (eventType) {
      case 'file-start': {
        const fileKey = data.filename || data.path || '';
        setCurrentFileName(fileKey);
        // initialise file bucket
        setFileResults((prev) => {
          const map = new Map(prev);
          if (!map.has(fileKey)) {
            map.set(fileKey, {
              filename: fileKey,
              path: data.path || '',
              matches: 0,
              rows: [],
            });
          }
          return map;
        });
        break;
      }
      case 'file-info':
        setCurrentFileName(data.filename || '');
        break;
      case 'row-processed':
        if (data.matches && data.matches.length > 0) {
          setHasSearchResults(true);
          // Group results per file
          setFileResults((prev) => {
            const map = new Map(prev);
            const fileKey = data.filename || data.filePath || currentFileName;

            const existing: FileResult =
              map.get(fileKey) ?? {
                filename: fileKey,
                path: data.filePath || '',
                matches: 0,
                rows: [],
              };

            const rowIndex = data.rowIndex || existing.rows.length + 1;

            // build fields from this event
            const fields: Record<string, string> = {};
            data.matches.forEach((match: any) => {
              if (match.newValue && match.newValue !== match.oldValue) {
                fields[match.field] = `${match.oldValue} → ${match.newValue}`;
              } else {
                fields[match.field] = match.oldValue || '';
              }
            });

            const existingRowIndex = existing.rows.findIndex(
              (r) => r.rowIndex === rowIndex,
            );

            if (existingRowIndex >= 0) {
              // merge into existing row (avoid duplicates)
              const existingRow = existing.rows[existingRowIndex];
              const mergedFields = { ...existingRow.fields, ...fields };

              // count only newly added fields as new matches
              const newFieldKeys = Object.keys(fields).filter(
                (key) => !existingRow.fields[key],
              );
              existing.matches += newFieldKeys.length;

              existing.rows[existingRowIndex] = {
                rowIndex,
                fields: mergedFields,
              };
            } else {
              // new row for this file
              existing.rows.push({
                rowIndex,
                fields,
              });
              existing.matches += data.matches.length;
            }

            map.set(fileKey, existing);
            return map;
          });
          
          // AUTO-SELECT ALL ROWS BY DEFAULT
          setSelectedRows((prev) => {
            const next = new Map(prev);
            const fileKey = data.filename || data.filePath || currentFileName;
            const rowSet = next.get(fileKey) || new Set<number>();
            rowSet.add(data.rowIndex);
            next.set(fileKey, rowSet);
            return next;
          });
          
          // AUTO-SELECT ALL FILES BY DEFAULT
          setSelectedFilesForReplace((prev) => {
            const next = new Set(prev);
            const fileKey = data.filename || data.filePath || currentFileName;
            next.add(fileKey);
            return next;
          });
        }
        break;
      case 'stats':
        setStats(data);
        break;
      case 'file-complete':
        setCurrentFileName('');
        if (data?.filename) {
          setExpandedFiles((prev) => {
            const next = new Set(prev);
            next.add(data.filename);
            return next;
          });
        }
        break;
      case 'complete':
        // Use ref to get operation type (avoids React state closure issues)
        const operationType = operationTypeRef.current;
        setIsProcessing(false);
        setIsReplacing(false);
        
        // Store operation type for download button visibility
        setLastOperationType(operationType);
        operationTypeRef.current = null; // Reset after use
        
        // After search completes, ensure all files with results are selected by default
        if (operationType === null || operationType === 'search') {
          setSelectedFilesForReplace((prev) => {
            const next = new Set(prev);
            fileResults.forEach((fileResult) => {
              next.add(fileResult.filename);
            });
            return next;
          });
          
          // Select all rows for all files by default
          setSelectedRows((prev) => {
            const next = new Map(prev);
            fileResults.forEach((fileResult) => {
              const rowSet = new Set<number>();
              fileResult.rows.forEach((row) => {
                rowSet.add(row.rowIndex);
              });
              next.set(fileResult.filename, rowSet);
            });
            return next;
          });
        }
        
        // Only set download URL for replace operations (not for search-only)
        if (operationType === 'replace' && data.downloadUrl) {
          setDownloadUrl(data.downloadUrl);
          setIsZip(data.isZip || false);
          
          // Automatically trigger download after replace completes
          setTimeout(() => {
            if (data.downloadUrl) {
              // Open download in a new tab
              window.open(data.downloadUrl, '_blank');
            }
          }, 500); // Small delay to ensure state is updated
        } else {
          // Clear download URL for search-only operations
          setDownloadUrl(null);
          setIsZip(false);
        }
        
        if (operationType === 'replace') {
          const filesProcessed = data.stats?.totalFiles || 0;
          const filesWithReplacements = data.stats?.processedFiles || 0;
          const totalReplacements = data.stats?.totalReplacements || 0;
          
          if (filesWithReplacements === 0) {
            toast.info(
              `Replace All complete! No replacements were made. Processed ${filesProcessed} file${filesProcessed !== 1 ? 's' : ''} with matches, but no values needed to be replaced.`
            );
          } else {
            toast.success(
              `Replace All complete! Replaced ${totalReplacements} value${totalReplacements !== 1 ? 's' : ''} in ${filesWithReplacements} file${filesWithReplacements !== 1 ? 's' : ''} out of ${filesProcessed} file${filesProcessed !== 1 ? 's' : ''} processed.`
            );
          }
        } else {
          toast.success(
            `Search complete! Found ${data.stats?.totalMatches || 0} match${data.stats?.totalMatches !== 1 ? 'es' : ''} in ${data.stats?.processedFiles || 0} file${data.stats?.processedFiles !== 1 ? 's' : ''}.`
          );
        }
        break;
      case 'error':
        console.error('Processing error:', data.error || data.message);
        const operationTypeOnError = operationTypeRef.current;
        setIsProcessing(false);
        setIsReplacing(false);
        operationTypeRef.current = null;
        let errorMsg = '';
        if (operationTypeOnError === 'replace') {
          errorMsg = `Replace All error: ${data.error || data.message || 'Unknown error'}`;
        } else {
          errorMsg = `Search error: ${data.error || data.message || 'Unknown error'}`;
        }
        toast.error(errorMsg);
        break;
      default:
        // Handle direct data objects without event type
        if (data.filename) setCurrentFileName(data.filename);
        if (data.totalFiles !== undefined) setStats(data);
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">CSV Search & Replace</h2>
          <div className="flex items-center gap-4">
            {downloadUrl && lastOperationType === 'replace' && (
              <Button
                onClick={() => {
                  window.open(downloadUrl, '_blank');
                }}
                variant="default"
                size="sm"
              >
                <Download className="mr-2 h-4 w-4" />
                Download {isZip ? 'Zip' : 'File'}
              </Button>
            )}
            {selectedFiles.length > 0 && (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} ready
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="find-replace">Find & Replace</TabsTrigger>
            <TabsTrigger value="info">How to Use</TabsTrigger>
          </TabsList>

          {/* Find & Replace Tab */}
          <TabsContent value="find-replace" className="space-y-6">
        {/* Search Section (Advanced only) */}
        <div className="space-y-4">
          <div className="space-y-3 border rounded p-3">
              <div className="flex items-center justify-between">
                <Label>Advanced Search Conditions</Label>
                <Button size="sm" variant="outline" onClick={addCondition}>
                  + Add Condition
                </Button>
              </div>

              {conditions.length === 0 && (
                <p className="text-xs text-zinc-500">
                  No conditions yet. All rows will match until you add one.
                </p>
              )}

              {conditions.map((cond) => (
                <div key={cond.id} className="flex gap-2 items-center">
                  {/* Field selector */}
                  <Select
                    value={cond.field}
                    onValueChange={(val) =>
                      updateCondition(cond.id, { field: val })
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {detectedFields.slice(1).map((field) => (
                        <SelectItem key={field} value={field}>
                          {field}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Match mode */}
                  <Select
                    value={cond.mode}
                    onValueChange={(val) =>
                      updateCondition(cond.id, { mode: val as MatchMode })
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="startsWith">Starts with</SelectItem>
                      <SelectItem value="endsWith">Ends with</SelectItem>
                      <SelectItem value="regex">Regex</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Value */}
                  <Input
                    className="flex-1"
                    placeholder="Value..."
                    value={cond.value}
                    onChange={(e) =>
                      updateCondition(cond.id, { value: e.target.value })
                    }
                  />

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeCondition(cond.id)}
                  >
                    ✕
                  </Button>
                </div>
              ))}

              {/* AND / OR toggle */}
              <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                <span>Match rows where:</span>
                <Button
                  size="sm"
                  variant={advancedLogic === 'AND' ? 'default' : 'outline'}
                  onClick={() => setAdvancedLogic('AND')}
                >
                  All conditions (AND)
                </Button>
                <Button
                  size="sm"
                  variant={advancedLogic === 'OR' ? 'default' : 'outline'}
                  onClick={() => setAdvancedLogic('OR')}
                >
                  Any condition (OR)
                </Button>
              </div>

              {/* Full-width Search button */}
              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={() => startProcessing()}
                  disabled={isProcessing || selectedFiles.length === 0}
                  className="w-full justify-center"
                >
                  {isProcessing && !isReplacing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

        {/* Replace All Section */}
        <div className="mt-6 pt-4 border-t space-y-4">
          <div className="space-y-3 border rounded p-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Replace All</Label>
              <Button size="sm" variant="outline" onClick={addReplaceCondition}>
                + Add Replace Condition
              </Button>
            </div>

            {/* Multiple Replace Conditions */}
            {replaceConditions.length === 0 && (
              <p className="text-xs text-zinc-500">
                No replace conditions yet. Add one to replace multiple fields.
              </p>
            )}

            {replaceConditions.map((cond) => (
              <div key={cond.id} className="flex gap-2 items-center">
                {/* Field selector */}
                <Select
                  value={cond.field}
                  onValueChange={(val) =>
                    updateReplaceCondition(cond.id, { field: val })
                  }
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {detectedFields.slice(1).map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Replace value */}
                <Input
                  className="flex-1"
                  placeholder="Enter replacement value (or 'empty' to clear)..."
                  value={cond.value}
                  onChange={(e) =>
                    updateReplaceCondition(cond.id, { value: e.target.value })
                  }
                />

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeReplaceCondition(cond.id)}
                >
                  ✕
                </Button>
              </div>
            ))}

            {/* Selection info */}
            {(selectedFilesForReplace.size > 0 || Array.from(selectedRows.values()).some(s => s.size > 0)) && (
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                {selectedFilesForReplace.size > 0 && (
                  <div>{selectedFilesForReplace.size} file{selectedFilesForReplace.size !== 1 ? 's' : ''} selected</div>
                )}
                {Array.from(selectedRows.entries()).map(([file, rows]) => {
                  if (rows.size > 0) {
                    return (
                      <div key={file}>
                        {file}: {rows.size} row{rows.size !== 1 ? 's' : ''} selected
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* Replace Selected button */}
            <div className="mt-3">
              <Button
                onClick={() => startReplace()}
                disabled={
                  isProcessing ||
                  replaceConditions.length === 0 ||
                  !hasSearchResults ||
                  fileResults.size === 0
                }
                className="w-full justify-center"
              >
                {isReplacing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Replacing...
                  </>
                ) : (
                  <>
                    <Replace className="mr-2 h-4 w-4" />
                    Replace Selected
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-matches"
              checked={showOnlyMatches}
              onCheckedChange={(checked) =>
                setShowOnlyMatches(checked === true)
              }
            />
            <Label
              htmlFor="show-matches"
              className="text-sm font-normal cursor-pointer"
            >
              Show only rows with matches
            </Label>
          </div>
        </div>


        {/* Statistics Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded p-4">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Total Found
            </div>
            <div className="text-2xl font-bold">
              {stats?.totalMatches || 0}
            </div>
          </div>
          <div className="border rounded p-4">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              General overall Stats
            </div>
            <div className="text-sm">
              Files: {stats?.processedFiles || 0}/{stats?.totalFiles || 0}
              <br />
              Rows: {stats?.processedRows || 0}/{stats?.totalRows || 0}
              {stats?.totalReplacements ? (
                <>
                  <br />
                  Replacements: {stats.totalReplacements}
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* CSV Filename */}
        {currentFileName && (
          <div>
            <Label>CSV Filename</Label>
            <Input value={currentFileName} readOnly className="mt-1" />
            <p className="text-xs text-zinc-500 mt-1">
              Currently processing: {currentFileName}
            </p>
          </div>
        )}

        {/* Search Results per CSV */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Search Results</Label>
            <Select value={fieldFilter} onValueChange={setFieldFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Fields</SelectItem>
                {detectedFields.slice(1).map((field) => (
                  <SelectItem key={field} value={field}>
                    {field}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fileResults.size > 0 ? (
            <div className="space-y-2">
              {Array.from(fileResults.entries()).map(([filename, fileResult]) => {
                const isExpanded = expandedFiles.has(filename);

                const allFields = new Set<string>();
                fileResult.rows.forEach((row) => {
                  Object.keys(row.fields).forEach((f) => allFields.add(f));
                });

                const displayFields =
                  fieldFilter === 'All'
                    ? Array.from(allFields)
                    : [fieldFilter];

                const filteredRows =
                  fieldFilter === 'All'
                    ? fileResult.rows
                    : fileResult.rows.filter((row) =>
                        Object.prototype.hasOwnProperty.call(
                          row.fields,
                          fieldFilter,
                        ),
                      );

                return (
                  <Collapsible
                    key={filename}
                    open={isExpanded}
                    onOpenChange={(open) => {
                      setExpandedFiles((prev) => {
                        const next = new Set(prev);
                        if (open) {
                          next.add(filename);
                        } else {
                          next.delete(filename);
                        }
                        return next;
                      });
                    }}
                  >
                    <div className="border rounded">
                      <div className="flex items-center gap-2 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedFilesForReplace.has(filename)}
                            onCheckedChange={(checked) => {
                              setSelectedFilesForReplace((prev) => {
                                const next = new Set(prev);
                                if (checked) {
                                  next.add(filename);
                                } else {
                                  next.delete(filename);
                                }
                                return next;
                              });
                            }}
                          />
                        </div>
                        <CollapsibleTrigger className="flex items-center gap-3 flex-1 text-left">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <div className="flex items-center gap-2 flex-1">
                            <Search className="h-4 w-4 text-zinc-500" />
                            <span className="font-medium">{filename}</span>
                            <span className="text-sm text-zinc-500">
                              ({fileResult.matches} matches in{' '}
                              {fileResult.rows.length} rows)
                            </span>
                          </div>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <div className="border-t overflow-auto max-h-[400px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">
                                  <Checkbox
                                    checked={
                                      filteredRows.length > 0 &&
                                      filteredRows.every((row) =>
                                        (selectedRows.get(filename) || new Set()).has(row.rowIndex)
                                      )
                                    }
                                    onCheckedChange={(checked) => {
                                      setSelectedRows((prev) => {
                                        const next = new Map(prev);
                                        const rowSet = next.get(filename) || new Set<number>();
                                        if (checked) {
                                          filteredRows.forEach((row) => rowSet.add(row.rowIndex));
                                        } else {
                                          filteredRows.forEach((row) => rowSet.delete(row.rowIndex));
                                        }
                                        next.set(filename, rowSet);
                                        return next;
                                      });
                                    }}
                                  />
                                </TableHead>
                                <TableHead className="w-20">Row</TableHead>
                                {displayFields.map((field) => (
                                  <TableHead
                                    key={field}
                                    className="min-w-[150px]"
                                  >
                                    {field}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredRows.map((row, idx) => {
                                const isRowSelected = (selectedRows.get(filename) || new Set()).has(row.rowIndex);
                                return (
                                  <TableRow
                                    key={idx}
                                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-800 ${isRowSelected ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
                                  >
                                    <TableCell>
                                      <Checkbox
                                        checked={isRowSelected}
                                        onCheckedChange={(checked) => {
                                          setSelectedRows((prev) => {
                                            const next = new Map(prev);
                                            const rowSet = next.get(filename) || new Set<number>();
                                            if (checked) {
                                              rowSet.add(row.rowIndex);
                                            } else {
                                              rowSet.delete(row.rowIndex);
                                            }
                                            next.set(filename, rowSet);
                                            return next;
                                          });
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {row.rowIndex}
                                    </TableCell>
                                    {displayFields.map((field) => (
                                      <TableCell
                                        key={field}
                                        className="max-w-[300px] truncate"
                                        title={row.fields[field] || '-'}
                                      >
                                        {row.fields[field] || '-'}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            <div className="border rounded p-8 text-center text-zinc-500">
              {isProcessing
                ? isReplacing
                  ? 'Replacing values... Results will appear as replacements are made.'
                  : 'Searching files... Results will appear as matches are found.'
                : 'No search results yet. Click Search to find matches.'}
            </div>
          )}
        </div>
          </TabsContent>

          {/* How to Use Tab */}
          <TabsContent value="info" className="space-y-6">
            <div className="space-y-6 max-w-3xl">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Info className="h-6 w-6 text-blue-500" />
                  <h3 className="text-xl font-semibold">How to Use CSV Bulk Search & Replace</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">1. Upload Your CSV Files</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Upload CSV files directly or provide public links from cloud storage services 
                      (Google Drive, Dropbox, Mega, TerraBox).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">2. Set Up Search Conditions</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Add one or more search conditions to find specific rows:
                    </p>
                    <ul className="list-disc list-inside text-sm text-zinc-600 dark:text-zinc-400 space-y-1 ml-4">
                      <li><strong>Field:</strong> Select the CSV column to search in</li>
                      <li><strong>Match Mode:</strong> Choose how to match (Contains, Equals, Starts with, Ends with, Regex)</li>
                      <li><strong>Value:</strong> Enter the value to search for</li>
                      <li><strong>Logic:</strong> Use AND (all conditions) or OR (any condition)</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">3. Run Search</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Click the "Search" button to find matching rows. Results will appear below showing 
                      which rows and fields matched your conditions.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">4. Replace Values (Optional)</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      After searching, you can replace values in matched rows:
                    </p>
                    <ul className="list-disc list-inside text-sm text-zinc-600 dark:text-zinc-400 space-y-1 ml-4">
                      <li>Add replace conditions with field and new value</li>
                      <li>Click "Replace All" to apply changes</li>
                      <li>Processed files will be available for download</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">5. Download Results</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      After processing, your files will be automatically prepared for download. 
                      Multiple files will be zipped together, single files will be downloaded directly.
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4 mt-6">
                  <h4 className="font-semibold mb-2">Tips:</h4>
                  <ul className="list-disc list-inside text-sm text-zinc-600 dark:text-zinc-400 space-y-1 ml-4">
                    <li>Use regex mode for advanced pattern matching</li>
                    <li>Combine multiple conditions with AND/OR logic for precise filtering</li>
                    <li>Check the search results before applying replacements</li>
                    <li>Processed files are automatically cleaned up after 1 hour</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

