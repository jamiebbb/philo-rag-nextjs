# PDF Parser System Guide

## Overview

The PDF parser system provides a modular, extensible architecture for handling different PDF parsing needs. Instead of being locked into a single parsing library, you can easily swap parsers or add new ones based on your requirements.

## Current Architecture

### Core Components

1. **PDFParser Interface** (`src/lib/pdf-parsers.ts`)
   - Defines the contract all parsers must implement
   - Ensures consistent API across different parsing libraries

2. **PDFParserFactory**
   - Creates parser instances
   - Manages available parsers registry
   - Provides automatic parser selection based on requirements

3. **High-level `parsePDF()` function**
   - Simplified interface for PDF parsing
   - Automatic fallback handling
   - Performance tracking and logging

## Currently Available Parsers

### 1. PDF-Parse Parser (Default)
- **Library**: `pdf-parse`
- **Best for**: Standard PDFs with embedded text
- **Features**: 
  - ✅ Text extraction
  - ✅ Basic metadata extraction
  - ❌ OCR capability
  - ❌ Encrypted PDF handling
  - ❌ Image extraction

### 2. Mock Parser
- **Purpose**: Testing and development
- **Best for**: Development and testing scenarios
- **Features**: 
  - ✅ All features (simulated)
  - Returns sample content for testing

## Usage Examples

### Basic Usage
```typescript
import { parsePDF } from '@/lib/pdf-parsers'

// Use default parser (pdf-parse)
const result = await parsePDF(buffer)
console.log(result.text, result.metadata)
```

### Specify Parser
```typescript
import { parsePDF } from '@/lib/pdf-parsers'

// Use specific parser
const result = await parsePDF(buffer, { 
  parser: 'pdf-parse' 
})
```

### Automatic Parser Selection
```typescript
import { parsePDF } from '@/lib/pdf-parsers'

// Auto-select best parser for OCR
const result = await parsePDF(buffer, {
  requirements: {
    ocrCapability: true,
    handleEncrypted: true
  }
})
```

### With Fallback
```typescript
import { parsePDF } from '@/lib/pdf-parsers'

// Try parser with fallback to mock on failure
const result = await parsePDF(buffer, {
  parser: 'pdf-parse',
  fallbackToMock: true
})
```

## Adding New Parsers

### Step 1: Install Parser Library
```bash
npm install your-pdf-parser-library
```

### Step 2: Create Parser Class
```typescript
// In src/lib/pdf-parsers.ts

import yourParser from 'your-pdf-parser-library'

export class YourPDFParser implements PDFParser {
  name = 'your-parser'
  description = 'Description of your parser and when to use it'

  async parse(buffer: Buffer): Promise<PDFParseResult> {
    const startTime = Date.now()
    
    try {
      // Use your parser library
      const data = await yourParser(buffer)
      const parseTime = Date.now() - startTime

      return {
        text: data.text,
        metadata: {
          pages: data.pageCount,
          title: data.title,
          // ... other metadata
        },
        parseTime,
        parserUsed: this.name
      }
    } catch (error) {
      throw new Error(`YourParser failed: ${error.message}`)
    }
  }

  supportsFeatures(): PDFParserFeatures {
    return {
      extractText: true,
      extractMetadata: true,
      handleEncrypted: false, // Update based on capabilities
      handleImages: true,     // Update based on capabilities
      preserveFormatting: false,
      ocrCapability: false
    }
  }
}
```

### Step 3: Register Parser
```typescript
// In src/lib/pdf-parsers.ts

const AVAILABLE_PARSERS = {
  'pdf-parse': PDFParseParser,
  'mock': MockPDFParser,
  'your-parser': YourPDFParser, // Add your parser here
} as const
```

### Step 4: Test Your Parser
```typescript
import { PDFParserFactory } from '@/lib/pdf-parsers'

const parser = PDFParserFactory.create('your-parser')
const result = await parser.parse(buffer)
console.log(result)
```

## Future Parser Suggestions

### PDF.js Parser
```typescript
export class PDFJSParser implements PDFParser {
  name = 'pdfjs'
  description = 'Mozilla PDF.js parser. Good for web compatibility and complex PDFs.'
  
  // Implementation using pdfjs-dist
}
```

### Tesseract OCR Parser
```typescript
export class TesseractOCRParser implements PDFParser {
  name = 'tesseract-ocr'
  description = 'OCR-based parser for scanned documents and images.'
  
  supportsFeatures(): PDFParserFeatures {
    return {
      extractText: true,
      extractMetadata: false,
      handleEncrypted: false,
      handleImages: true,
      preserveFormatting: false,
      ocrCapability: true  // This is the key feature
    }
  }
}
```

### PDF-lib Parser
```typescript
export class PDFLibParser implements PDFParser {
  name = 'pdf-lib'
  description = 'PDF-lib parser with advanced formatting preservation.'
  
  supportsFeatures(): PDFParserFeatures {
    return {
      extractText: true,
      extractMetadata: true,
      handleEncrypted: true,
      handleImages: true,
      preserveFormatting: true,  // Key feature
      ocrCapability: false
    }
  }
}
```

## API Integration

### Using in Document Upload
The preview-chunks API now supports parser selection:

```javascript
const formData = new FormData()
formData.append('files', file)
formData.append('pdfParser', 'pdf-parse') // Specify parser
```

### Parser Information Endpoint
Get available parsers and their capabilities:

```bash
GET /api/pdf-parsers
```

Response:
```json
{
  "success": true,
  "parsers": [
    {
      "name": "pdf-parse",
      "description": "Fast PDF text extraction...",
      "features": { ... },
      "recommended_for": ["Standard PDFs with embedded text"]
    }
  ],
  "default_parser": "pdf-parse",
  "total_available": 2
}
```

## Configuration

### Environment Variables
```bash
# Default parser to use
PDF_PARSER_DEFAULT=pdf-parse

# Enable fallback to mock in development
PDF_PARSER_FALLBACK_TO_MOCK=true
```

### Runtime Parser Selection
The system can automatically select the best parser based on requirements:

```typescript
// Will automatically choose parser with OCR capability
const result = await parsePDF(buffer, {
  requirements: { ocrCapability: true }
})
```

## Performance Monitoring

All parsers track performance metrics:

```typescript
const result = await parsePDF(buffer)
console.log(`Parsed with ${result.parserUsed} in ${result.parseTime}ms`)
```

## Error Handling

The system provides robust error handling with fallback options:

```typescript
try {
  const result = await parsePDF(buffer, {
    parser: 'preferred-parser',
    fallbackToMock: true
  })
} catch (error) {
  // Handle case where even fallback fails
}
```

## Best Practices

1. **Choose the right parser for your use case**:
   - `pdf-parse`: Fast, standard PDFs
   - `tesseract-ocr`: Scanned documents
   - `pdf-lib`: Complex formatting needs

2. **Use automatic selection** when requirements are clear:
   ```typescript
   await parsePDF(buffer, {
     requirements: { handleEncrypted: true }
   })
   ```

3. **Always handle errors** and consider fallbacks for production

4. **Monitor performance** and choose parsers based on your speed/quality needs

5. **Test with real documents** from your target use cases

## Troubleshooting

### Common Issues

1. **Parser not found**: Check parser name spelling and registration
2. **Performance issues**: Consider switching to a faster parser for your use case
3. **Parsing failures**: Enable fallback or try a different parser
4. **Missing features**: Check parser capabilities with `supportsFeatures()`

### Debug Information
Enable detailed logging by checking the browser console and server logs when using the preview-chunks API. 