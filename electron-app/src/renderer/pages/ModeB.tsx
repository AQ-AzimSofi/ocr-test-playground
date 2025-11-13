import { useState } from 'react';

interface ProcessorInput {
  id: string;
  processor: string;
  text: string;
}

export default function ModeB() {
  const [groundTruth, setGroundTruth] = useState('');
  const [processorInputs, setProcessorInputs] = useState<ProcessorInput[]>([
    { id: '1', processor: '', text: '' },
  ]);
  const [processing, setProcessing] = useState(false);

  const addProcessorInput = () => {
    const newId = String(Date.now());
    setProcessorInputs([...processorInputs, { id: newId, processor: '', text: '' }]);
  };

  const removeProcessorInput = (id: string) => {
    if (processorInputs.length === 1) {
      alert('You must have at least one processor input');
      return;
    }
    setProcessorInputs(processorInputs.filter((p) => p.id !== id));
  };

  const updateProcessorInput = (id: string, field: 'processor' | 'text', value: string) => {
    setProcessorInputs(
      processorInputs.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleRunComparison = async () => {
    // Validation
    if (!groundTruth.trim()) {
      alert('Please enter ground truth text');
      return;
    }

    const validInputs = processorInputs.filter(
      (p) => p.processor.trim() && p.text.trim()
    );

    if (validInputs.length === 0) {
      alert('Please enter at least one processor output with text');
      return;
    }

    setProcessing(true);

    try {
      const result = await window.electronAPI.processOCR({
        mode: 'text',
        processors: validInputs.map((p) => p.processor),
        textInputs: validInputs.map((p) => ({
          processor: p.processor,
          text: p.text,
        })),
        groundTruth,
      });

      if (result.success && result.reportPath) {
        alert(`Comparison completed successfully!\n\nReport saved to:\n${result.reportPath}`);

        // Open the report
        await window.electronAPI.openPath(result.reportPath);
      } else {
        alert(`Comparison failed:\n${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Text Comparison (Lite Mode)
        </h2>
        <p className="text-gray-600 mb-6">
          Compare multiple OCR outputs against a single ground truth without uploading files.
          Just copy-paste your text and get comprehensive accuracy metrics.
        </p>

        {/* Ground Truth Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            1. Enter Ground Truth
          </h3>
          <textarea
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
            disabled={processing}
            className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 font-mono text-sm"
            placeholder="Paste the correct text here..."
          />
          <p className="mt-1 text-xs text-gray-500">
            {groundTruth.length} characters
          </p>
        </div>

        {/* Processor Outputs Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              2. Add Processor Outputs
            </h3>
            <button
              onClick={addProcessorInput}
              disabled={processing}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              + Add Processor
            </button>
          </div>

          <div className="space-y-4">
            {processorInputs.map((input, index) => (
              <div key={input.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-700">
                    Processor #{index + 1}
                  </h4>
                  <button
                    onClick={() => removeProcessorInput(input.id)}
                    disabled={processing || processorInputs.length === 1}
                    className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Processor Name / Label
                  </label>
                  <input
                    type="text"
                    value={input.processor}
                    onChange={(e) =>
                      updateProcessorInput(input.id, 'processor', e.target.value)
                    }
                    disabled={processing}
                    placeholder="e.g., Google Cloud Vision, Azure Read, Custom OCR..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OCR Output Text
                  </label>
                  <textarea
                    value={input.text}
                    onChange={(e) =>
                      updateProcessorInput(input.id, 'text', e.target.value)
                    }
                    disabled={processing}
                    placeholder="Paste the OCR'd text from this processor..."
                    className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {input.text.length} characters
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <button
          onClick={handleRunComparison}
          disabled={processing || !groundTruth.trim()}
          className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? 'Processing...' : 'Run Comparison'}
        </button>

        {/* Info */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="font-medium text-gray-900 mb-2">Features:</h4>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            <li>
              <strong>Order-Dependent Metrics:</strong> CER, precision, recall,
              F1 score, edit distance
            </li>
            <li>
              <strong>Order-Independent Metrics:</strong> Alphabetically sorted
              comparison - measures content completeness regardless of text order
            </li>
            <li>
              <strong>Character-Level Diff:</strong> Visual comparison showing
              insertions, deletions, and substitutions
            </li>
            <li>
              <strong>Side-by-Side Comparison:</strong> OCR output vs ground
              truth aligned by lines
            </li>
            <li>
              <strong>HTML Report:</strong> Same comprehensive report format as
              PDF testing mode
            </li>
          </ul>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
          <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
            <li>Enter your ground truth (the correct text)</li>
            <li>
              For each processor you want to test, add an input and paste its
              OCR'd text
            </li>
            <li>Click "Run Comparison" to calculate all metrics</li>
            <li>View the generated HTML report with detailed comparison</li>
          </ol>
          <p className="text-xs text-blue-600 mt-2">
            <strong>Tip:</strong> You can test as many processors as you want
            by clicking "+ Add Processor"
          </p>
        </div>
      </div>
    </div>
  );
}
