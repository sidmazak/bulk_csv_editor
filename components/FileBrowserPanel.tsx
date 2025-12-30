'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { FileBrowserResponse, FileInfo } from '@/lib/filebrowser-client';
import { Folder, File, ChevronRight, Upload, Search } from 'lucide-react';

interface FileBrowserPanelProps {
  onFilesSelected: (files: Array<{ path: string; name: string }>) => void;
}

export function FileBrowserPanel({ onFilesSelected }: FileBrowserPanelProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [resources, setResources] = useState<FileBrowserResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(['/']);
  const [folderSelectionState, setFolderSelectionState] = useState<Map<string, boolean>>(new Map());

  const loadResources = async (path: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/filebrowser/list?path=${encodeURIComponent(path)}`
      );
      if (!response.ok) throw new Error('Failed to load resources');
      const data = await response.json();
      setResources(data);
      setCurrentPath(path);

      // Update breadcrumbs
      if (path === '/') {
        setBreadcrumbs(['/']);
      } else {
        const parts = path.split('/').filter(Boolean);
        setBreadcrumbs(['/', ...parts]);
      }
    } catch (error) {
      console.error('Error loading resources:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResources('/');
  }, []);

  const handleDirectoryClick = (folder: FileInfo) => {
    // Construct path using currentPath since ItemInfo doesn't have path property
    const newPath =
      currentPath === '/' ? `/${folder.name}` : `${currentPath}/${folder.name}`;
    loadResources(newPath);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === 0) {
      loadResources('/');
    } else {
      const path = '/' + breadcrumbs.slice(1, index + 1).join('/');
      loadResources(path);
    }
  };

  const handleFileToggle = (file: FileInfo) => {
    // Construct full path for the file using currentPath
    const filePath =
      currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    
    const newSelected = new Set(selectedFiles);
    const wasSelected = newSelected.has(filePath);
    
    if (wasSelected) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    setSelectedFiles(newSelected);
    updateSelectedFiles(newSelected);
    
    // Update folder selection state - if any file in a folder is deselected, uncheck the folder
    // We'll check all folders to see if they should be unchecked
    setFolderSelectionState((prev) => {
      const newMap = new Map(prev);
      // Clear folder states that might be affected
      // In a more sophisticated implementation, we'd check each folder
      // For now, we'll let the folder checkbox handle its own state
      return newMap;
    });
  };

  const handleDirectorySelect = async (folder: FileInfo, checked: boolean) => {
    setLoading(true);
    try {
      // Construct path using currentPath since ItemInfo doesn't have path property
      const folderPath =
        currentPath === '/'
          ? `/${folder.name}`
          : `${currentPath}/${folder.name}`;

      // Use the dedicated CSV files endpoint
      const response = await fetch(
        `/api/filebrowser/csv-files?path=${encodeURIComponent(folderPath)}`
      );
      if (!response.ok) throw new Error('Failed to load CSV files');
      const data = await response.json();

      const newSelected = new Set(selectedFiles);
      if (checked) {
        // Add all CSV files from this directory
        data.files.forEach((file: { path: string; name: string }) => {
          newSelected.add(file.path);
        });
      } else {
        // Remove all CSV files from this directory
        data.files.forEach((file: { path: string; name: string }) => {
          newSelected.delete(file.path);
        });
      }
      setSelectedFiles(newSelected);
      updateSelectedFiles(newSelected);
    } catch (error) {
      console.error('Error selecting directory:', error);
      alert('Failed to select CSV files from directory');
    } finally {
      setLoading(false);
    }
  };

  // Check if all CSV files in a folder are selected
  const isFolderFullySelected = async (folder: FileInfo): Promise<boolean> => {
    try {
      const folderPath =
        currentPath === '/'
          ? `/${folder.name}`
          : `${currentPath}/${folder.name}`;

      const response = await fetch(
        `/api/filebrowser/csv-files?path=${encodeURIComponent(folderPath)}`
      );
      if (!response.ok) return false;
      const data = await response.json();

      if (data.files.length === 0) return false;

      // Check if all files from this folder are selected
      return data.files.every((file: { path: string; name: string }) =>
        selectedFiles.has(file.path)
      );
    } catch (error) {
      return false;
    }
  };

  const updateSelectedFiles = (selected: Set<string>) => {
    const files = Array.from(selected).map((path) => {
      const parts = path.split('/');
      return {
        path,
        name: parts[parts.length - 1],
      };
    });
    onFilesSelected(files);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    // For now, we'll handle uploads through the filebrowser API
    // In a real implementation, you'd upload to filebrowser first
    const newSelected = new Set(selectedFiles);
    const tempPath = `/uploads/${file.name}`;
    newSelected.add(tempPath);
    setSelectedFiles(newSelected);
    updateSelectedFiles(newSelected);
  };

  return (
    <div className="flex h-full flex-col border-r bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="border-b p-4 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filebrowser View</h2>
          {selectedFiles.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedFiles(new Set());
                  setFolderSelectionState(new Map());
                  onFilesSelected([]);
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="filebrowser" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="mx-4 mt-2 shrink-0">
          <TabsTrigger value="filebrowser" className="flex-1">
            <Search className="mr-2 h-4 w-4" />
            Browse
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex-1">
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="filebrowser" className="flex-1 flex flex-col mt-0 min-h-0 overflow-hidden">
          <div className="p-4 border-b shrink-0">
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center gap-2">
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className="hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {crumb === '/' ? 'root' : crumb}
                  </button>
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-h-0">
            {loading ? (
              <div className="text-center text-zinc-500">Loading...</div>
            ) : (
              <div className="space-y-2">
                {resources?.folders.map((folder) => {
                  // Construct path for key and operations
                  const folderPath =
                    currentPath === '/'
                      ? `/${folder.name}`
                      : `${currentPath}/${folder.name}`;
                  
                  return (
                    <div
                      key={folderPath}
                      className="flex items-center gap-2 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                    >
                      {/* Separate checkbox container - stops event propagation */}
                      <div
                        className="flex items-center shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          onCheckedChange={(checked) => {
                            handleDirectorySelect(folder, checked === true);
                            // Update local state immediately for UI feedback
                            setFolderSelectionState((prev) => {
                              const newMap = new Map(prev);
                              newMap.set(folderPath, checked === true);
                              return newMap;
                            });
                          }}
                          checked={folderSelectionState.get(folderPath) || false}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      
                      {/* Separate clickable link area */}
                      <button
                        onClick={() => handleDirectoryClick(folder)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <Folder className="h-4 w-4 text-blue-500" />
                        <span>{folder.name}</span>
                      </button>
                    </div>
                  );
                })}

                {resources?.files
                  .filter((f) => f.name.toLowerCase().endsWith('.csv'))
                  .map((file) => {
                    // Construct full path for the file
                    const filePath =
                      currentPath === '/'
                        ? `/${file.name}`
                        : `${currentPath}/${file.name}`;
                    
                    return (
                      <div
                        key={filePath}
                        className="flex items-center gap-2 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                      >
                        {/* Separate checkbox container - stops event propagation */}
                        <div
                          className="flex items-center shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedFiles.has(filePath)}
                            onCheckedChange={() => handleFileToggle(file)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        
                        {/* File info display (not clickable, but visually separated) */}
                        <div className="flex items-center gap-2 flex-1">
                          <File className="h-4 w-4 text-green-500" />
                          <span className="flex-1">{file.name}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="upload" className="flex-1 flex flex-col mt-0 p-4 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Upload CSV File
              </label>
              <Input
                type="file"
                accept=".csv"
                onChange={handleUpload}
                className="cursor-pointer"
              />
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Select a CSV file to add to the processing queue
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

