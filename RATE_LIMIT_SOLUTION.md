# Gemini API Rate Limit Handling Solution

## Problem
When running hybrid OCR processors (Azure+Gemini, Cloud Vision+Gemini, Document AI+Gemini), users encountered this error:

```
Error: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [429 Too Many Requests] You exceeded your current quota, please check your plan and billing details.
```

The error provided no guidance to users on what to do, especially those using the free tier.

## Solution Overview

I've implemented a comprehensive rate limit handling system with:
1. **Smart Request Queue** - Manages API requests with configurable concurrency and delays
2. **Automatic Error Detection** - Identifies rate limit errors and extracts retry information
3. **User-Friendly Prompts** - Shows clear options when rate limits are hit
4. **Graceful Degradation** - Can continue processing at a slower rate
5. **Progress Feedback** - Shows queue status and estimated completion time

## Key Components Created

### 1. Error Handling (`electron-app/src/main/utils/gemini-errors.ts`)
- **GeminiRateLimitError**: Custom error class that parses Google's rate limit responses
- Extracts retry delay, quota limits, and provides user-friendly messages
- Example: "Rate limit reached. Your free tier allows 10 requests per minute. Suggested wait time: 6.5 seconds."

### 2. Request Queue System (`electron-app/src/main/utils/gemini-queue.ts`)
- **GeminiRequestQueue**: Smart queue for managing Gemini API requests
- Features:
  - Configurable concurrency (default: 2 for free tier)
  - Delays between batches (default: 2s)
  - Automatic retry with exponential backoff
  - Dynamic rate limiting (reduces concurrency when limits hit)
  - Progress tracking and callbacks

**Default Configuration:**
```typescript
{
  concurrency: 2,           // Max 2 concurrent requests
  delayBetweenBatches: 2000, // 2 second delay between batches
  maxRetries: 3,            // Retry up to 3 times
  autoRetry: true           // Auto-retry on rate limits
}
```

### 3. Updated Processors
All hybrid processors now support queue configuration:
- `azure-read-gemini-hybrid-processor.ts`
- `cloud-vision-gemini-hybrid-processor.ts`
- `document-ai-gemini-hybrid-processor.ts`
- `gemini-text-processor.ts`

### 4. IPC Communication (`electron-app/src/main/ipc-handlers.ts`)
- New IPC event: `rate-limit-detected` - Sent to renderer when rate limit hits
- New IPC handler: `rate-limit-decision` - Receives user's choice
- Integrated into `process-ocr` handler with automatic callbacks

### 5. User Interface (`electron-app/src/renderer/pages/ModeA.tsx`)
- **Rate Limit Dialog**: Beautiful modal that appears when rate limits are hit
- **Three Options:**
  1. **Continue at Slower Rate** (Recommended) - Reduces concurrency and adds delays
  2. **Skip This Test** - Skips current processor, continues with others
  3. **Cancel All Tests** - Stops all processing immediately

- **Queue Progress Display**: Shows real-time queue statistics
  - Completed / Total requests
  - Currently processing count
  - Queued requests count
  - Current status

## How It Works

### Normal Flow (No Rate Limits)
1. User runs OCR test with hybrid processors
2. Gemini API requests are queued
3. Queue processes requests with concurrency limit (2) and delays (2s)
4. Progress updates shown in UI
5. Processing completes successfully

### Rate Limit Encountered
1. Queue detects 429 error from Gemini API
2. Parses error to extract retry delay and quota info
3. Sends IPC event to renderer: `rate-limit-detected`
4. **Dialog appears** showing:
   - User-friendly error message
   - Free tier quota information (e.g., "10 requests/minute")
   - Suggested wait time
   - Three clear options

5. User selects an option:
   - **Continue**: Queue reduces concurrency to 1, increases delay, waits for suggested time, then retries
   - **Skip**: Current batch fails, moves to next processor
   - **Cancel**: All queued requests are cancelled

6. Queue continues based on user's decision

## User Experience Benefits

### Before (Without This Solution)
- Technical error message with no guidance
- Processing stops abruptly
- User doesn't know what to do
- No option to continue at slower rate
- No visibility into what's happening

### After (With This Solution)
- Clear, friendly explanation of the issue
- Shows quota limits ("10 requests/minute")
- Suggests wait time ("6.5 seconds")
- Offers choice to continue slower, skip, or cancel
- Shows queue progress (completed/total, processing, queued)
- Automatic retry with backoff
- Works seamlessly for both free and paid tiers

## Example User Journey

1. User with free Gemini API key runs 3 hybrid processors on a PDF
2. Each processor needs to process ~15 regions
3. After 10 requests (free tier limit), rate limit hits
4. **Dialog appears:**
   ```
   API Rate Limit Reached

   Rate limit reached. Your free tier allows 10 requests per minute.
   Suggested wait time: 6.5 seconds.

   Free tier limit: 10 requests/minute

   What would you like to do?

   [Continue at Slower Rate]
   Reduce concurrency and add delays. Processing will be slower but will complete.

   [Skip This Test]
   Skip the current processor and continue with others.

   [Cancel All Tests]
   Stop all processing immediately.
   ```

5. User clicks "Continue at Slower Rate"
6. Queue:
   - Reduces concurrency from 2 to 1
   - Increases delay from 2s to 4s
   - Waits 6.5 seconds
   - Resumes processing

7. Processing continues successfully (slower but reliable)
8. User sees queue progress: "Completed: 10 / 45 | Processing: 1 | Queued: 34"
9. All tests complete with results

## Configuration

### Current Default Settings (Optimized for Free Tier)
```typescript
{
  concurrency: 2,           // Max 2 requests at once
  delayBetweenBatches: 2000, // 2 second delay between batches
  maxRetries: 3,            // Retry up to 3 times per request
  autoRetry: true           // Automatically retry on rate limits
}
```

### After Rate Limit Hit (Auto-Adjusted)
```typescript
{
  concurrency: 1,           // Reduced to 1 request at a time
  delayBetweenBatches: 4000, // Increased to 4 second delay
  maxRetries: 3,
  autoRetry: true
}
```

## Future Enhancements (Optional)

### Settings Page Configuration (Not Yet Implemented)
You could add UI controls in the Settings page to let advanced users customize:
- Concurrency limit (1-5)
- Delay between batches (0-5 seconds)
- Max retry attempts (1-5)
- Auto-retry toggle (on/off)

This would allow power users to fine-tune for their API tier while keeping smart defaults for everyone else.

## Testing the Solution

To test this implementation:

1. **Use a free Gemini API key** (10 requests/minute limit)
2. **Run a hybrid processor** (e.g., Azure Read + Gemini Hybrid)
3. **Use a file that requires many Gemini calls** (e.g., document with many low-confidence words)
4. **Watch for the rate limit dialog** to appear
5. **Select "Continue at Slower Rate"**
6. **Observe the queue progress** updating
7. **Verify processing completes** successfully

## Files Modified/Created

### New Files Created:
- `electron-app/src/main/utils/gemini-errors.ts` - Error handling
- `electron-app/src/main/utils/gemini-queue.ts` - Request queue system

### Files Modified:
- `electron-app/src/main/processors/gemini-text-processor.ts` - Queue integration
- `electron-app/src/main/processors/azure-read-gemini-hybrid-processor.ts` - Queue config support
- `electron-app/src/main/processors/cloud-vision-gemini-hybrid-processor.ts` - Queue config support
- `electron-app/src/main/processors/document-ai-gemini-hybrid-processor.ts` - Queue config support
- `electron-app/src/main/processors/types.ts` - Added queue config types
- `electron-app/src/main/processors/processor-factory.ts` - Pass queue config to processors
- `electron-app/src/main/ipc-handlers.ts` - Rate limit IPC communication
- `electron-app/src/renderer/pages/ModeA.tsx` - UI dialog and progress display

## Summary

This solution transforms a frustrating technical error into a manageable user experience. Free tier users can now:
- **Understand** what's happening (clear error messages)
- **Choose** how to proceed (continue/skip/cancel)
- **Monitor** progress (queue statistics)
- **Complete** their tests (slower but successfully)

The system automatically adjusts rate limiting based on errors, making it resilient to API quotas while maintaining good user experience for both free and paid tier users.
