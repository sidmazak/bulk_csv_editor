# CSV Analyze - Bulk CSV Search & Replace Tool

A comprehensive Next.js application for bulk CSV file search and replace operations with real-time streaming updates, integrated with Filebrowser.

## Features

- **Filebrowser Integration**: Browse and select CSV files from a remote Filebrowser server
- **Bulk Processing**: Process multiple CSV files serially with real-time progress updates
- **Field-Specific Search**: Target specific CSV columns or search across all fields
- **Real-Time Streaming**: EventSource-based streaming for live progress updates
- **Safe Replacements**: Always creates new files (with `_replaced` suffix) to preserve originals
- **Live Preview**: See matching rows and statistics in real-time
- **Directory Selection**: Select entire directories to automatically include all CSV files

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory:

```env
FILEBROWSER_URL=https://your-filebrowser-server.com
FILEBROWSER_API_KEY=your-api-key-here
FILEBROWSER_SOURCE=default
```

- `FILEBROWSER_URL`: The base URL of your Filebrowser server
- `FILEBROWSER_API_KEY`: Your Filebrowser API key (optional, if authentication is required)
- `FILEBROWSER_SOURCE`: The source name in Filebrowser (default: "default")

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Left Panel - File Browser

1. **Browse Tab**: 
   - Navigate through directories using the breadcrumb or folder icons
   - Select individual CSV files using checkboxes
   - Select a directory to automatically include all CSV files recursively

2. **Upload Tab**:
   - Upload CSV files directly to the processing queue

### Right Panel - CSV Processor

1. **Select Fields**: Choose which CSV columns to search (or select "All" for all fields)

2. **Search & Replace**:
   - Enter search keyword in "From" field
   - Enter replacement text in "To" field (optional - leave empty for search only)
   - Click "Replace All" to start processing

3. **Real-Time Updates**:
   - Watch statistics update in real-time
   - See preview of matching rows
   - Monitor current file being processed

4. **Results**:
   - New CSV files are created with `_replaced` suffix
   - Original files remain unchanged
   - Files are uploaded back to Filebrowser automatically

## CSV Fields

The application supports the following CSV fields:

- slug_url
- title
- occ_name
- country
- state
- location
- avg_annual_salary
- avg_hourly_salary
- hourly_low_value
- hourly_high_value
- fortnightly_salary
- monthly_salary
- total_pay_min
- total_pay_max
- bonus_range_min
- bonus_range_max
- profit_sharing_min
- profit_sharing_max
- commission_min
- commission_max
- gender_male
- gender_female
- one_yr
- one_four_yrs
- five_nine_yrs
- ten_nineteen_yrs
- twenty_yrs_plus
- percentile_10
- percentile_25
- percentile_50
- percentile_75
- percentile_90
- skills
- data_source
- contribution_count
- last_verified_at
- created_at
- updated_at
- company_name

## Architecture

### API Routes

- `/api/filebrowser/list` - List files and directories
- `/api/filebrowser/download` - Download CSV files
- `/api/filebrowser/upload` - Upload processed CSV files
- `/api/filebrowser/csv-files` - Get all CSV files recursively from a directory
- `/api/csv/process` - Main processing endpoint with EventSource streaming

### Components

- `FileBrowserPanel` - Left panel for file browsing and selection
- `CSVProcessorPanel` - Right panel for search/replace operations

### Libraries

- **PapaParse**: CSV parsing and generation
- **shadcn/ui**: UI component library
- **Next.js 16**: React framework with App Router

## Development

```bash
# Development
npm run dev

# Build
npm run build

# Start production server
npm start

# Lint
npm run lint
```

## License

MIT
