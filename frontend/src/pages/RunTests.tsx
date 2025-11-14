import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrawings, useCreateTestRun } from '../api/queries';
import {
  getProcessorInfo,
  getAllProcessorNames,
  type ProcessorInfo,
} from '../utils/processorInfo';

type FileSource = 'existing' | 'upload';

export function RunTests() {
  const navigate = useNavigate();
  const { data: drawingsData, isLoading: drawingsLoading } = useDrawings();
  const createTestRun = useCreateTestRun();
  const [selectedProcessors, setSelectedProcessors] = useState<Set<string>>(
    new Set()
  );
  const [fileSource, setFileSource] = useState<FileSource>('existing');
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<Set<string>>(
    new Set()
  );

  const drawings = drawingsData?.data || [];
  const allProcessors = getAllProcessorNames();

  // Categorize processors
  const confidentialSafeProcessors = [
    'cloud-vision',
    'azure-read',
    'azure-layout',
    'document-ai',
  ];

  const geminiBasedProcessors = allProcessors.filter(
    (name) => !confidentialSafeProcessors.includes(name)
  );

  // Check if any selected drawings are confidential
  const hasConfidentialDrawings =
    fileSource === 'existing' &&
    Array.from(selectedDrawingIds).some((id) => {
      const drawing = drawings.find((d) => d.drawingId === id);
      return drawing?.isConfidential;
    });

  // Auto-uncheck Gemini processors if confidential drawings selected
  const getAvailableProcessors = () => {
    if (hasConfidentialDrawings) {
      return allProcessors.filter((p) => confidentialSafeProcessors.includes(p));
    }
    return allProcessors;
  };

  const handleProcessorToggle = (processorName: string) => {
    setSelectedProcessors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(processorName)) {
        newSet.delete(processorName);
      } else {
        newSet.add(processorName);
      }
      return newSet;
    });
  };

  const handleSelectAllProcessors = (processors: string[]) => {
    const availableProcessors = getAvailableProcessors();
    const selectableProcessors = processors.filter((p) =>
      availableProcessors.includes(p)
    );

    const allSelected = selectableProcessors.every((p) =>
      selectedProcessors.has(p)
    );

    setSelectedProcessors((prev) => {
      const newSet = new Set(prev);
      if (allSelected) {
        // Deselect all
        selectableProcessors.forEach((p) => newSet.delete(p));
      } else {
        // Select all
        selectableProcessors.forEach((p) => newSet.add(p));
      }
      return newSet;
    });
  };

  const handleDrawingToggle = (drawingId: string) => {
    setSelectedDrawingIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(drawingId)) {
        newSet.delete(drawingId);
      } else {
        newSet.add(drawingId);
      }
      return newSet;
    });
  };

  const handleSelectAllDrawings = () => {
    const allSelected = selectedDrawingIds.size === drawings.length;
    if (allSelected) {
      setSelectedDrawingIds(new Set());
    } else {
      setSelectedDrawingIds(new Set(drawings.map((d) => d.drawingId)));
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (selectedProcessors.size === 0) {
      alert('Please select at least one processor');
      return;
    }

    if (fileSource === 'existing' && selectedDrawingIds.size === 0) {
      alert('Please select at least one drawing');
      return;
    }

    // Check for confidential + Gemini conflict
    if (hasConfidentialDrawings) {
      const hasGeminiProcessor = Array.from(selectedProcessors).some((p) =>
        geminiBasedProcessors.includes(p)
      );
      if (hasGeminiProcessor) {
        alert(
          'Cannot run Gemini-based processors on confidential files. Please deselect confidential files or use only pure OCR processors.'
        );
        return;
      }
    }

    try {
      const result: any = await createTestRun.mutateAsync({
        processors: Array.from(selectedProcessors),
        drawingIds: Array.from(selectedDrawingIds),
      });

      if (result.success) {
        // Show success message with note about manual execution
        alert(
          `Test run created successfully!\n\n${result.data.message}\n\nYou'll be redirected to the home page.`
        );
        navigate('/');
      } else {
        alert(`Failed to create test run: ${result.error}`);
      }
    } catch (error: any) {
      console.error('Failed to create test run:', error);
      alert(
        `Failed to create test run: ${error.message || 'Unknown error'}`
      );
    }
  };

  const calculateEstimatedCost = () => {
    const processors = Array.from(selectedProcessors);
    const numDrawings =
      fileSource === 'existing' ? selectedDrawingIds.size : 0;

    // Rough cost estimates (per drawing)
    const costPerDrawing: Record<string, number> = {
      'cloud-vision': 0.15,
      'azure-read': 0.225,
      'azure-layout': 1.5,
      'document-ai': 0.225,
      'hybrid-cv-ai': 0.75,
      'gemini-geometric': 1.5,
    };

    let totalCost = 0;
    processors.forEach((p) => {
      totalCost += (costPerDrawing[p] || 1.0) * numDrawings;
    });

    return totalCost;
  };

  if (drawingsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  const availableProcessors = getAvailableProcessors();
  const estimatedCost = calculateEstimatedCost();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back to Test Runs
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Run New Test</h1>
          <p className="text-gray-600 mt-2">
            Select processors and drawings to test OCR accuracy
          </p>
        </div>

        {/* Confidential Warning Banner */}
        {hasConfidentialDrawings && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Confidential Files Detected
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    You have selected confidential drawings. Only pure OCR
                    processors (no AI) are available. Gemini-based processors
                    have been automatically disabled.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Processor Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              1. Select Processors
            </h2>

            {/* Pure OCR Processors */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-green-700">
                  Pure OCR (Confidential-Safe)
                </h3>
                <button
                  onClick={() =>
                    handleSelectAllProcessors(confidentialSafeProcessors)
                  }
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
              </div>
              <div className="space-y-2">
                {confidentialSafeProcessors.map((processorName) => {
                  const info = getProcessorInfo(processorName);
                  const isAvailable = availableProcessors.includes(processorName);
                  return (
                    <ProcessorCheckbox
                      key={processorName}
                      processorName={processorName}
                      info={info}
                      checked={selectedProcessors.has(processorName)}
                      onChange={handleProcessorToggle}
                      disabled={!isAvailable}
                    />
                  );
                })}
              </div>
            </div>

            {/* Gemini-Based Processors */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  AI-Enhanced (Not for Confidential Data)
                </h3>
                <button
                  onClick={() =>
                    handleSelectAllProcessors(geminiBasedProcessors)
                  }
                  className="text-xs text-blue-600 hover:text-blue-800"
                  disabled={hasConfidentialDrawings}
                >
                  Select All
                </button>
              </div>
              <div className="space-y-2">
                {geminiBasedProcessors.map((processorName) => {
                  const info = getProcessorInfo(processorName);
                  const isAvailable = availableProcessors.includes(processorName);
                  return (
                    <ProcessorCheckbox
                      key={processorName}
                      processorName={processorName}
                      info={info}
                      checked={selectedProcessors.has(processorName)}
                      onChange={handleProcessorToggle}
                      disabled={!isAvailable}
                      disabledReason={
                        !isAvailable && hasConfidentialDrawings
                          ? 'Not available for confidential files'
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: File Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              2. Select Files
            </h2>

            {/* File Source Radio */}
            <div className="mb-4">
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="existing"
                    checked={fileSource === 'existing'}
                    onChange={(e) =>
                      setFileSource(e.target.value as FileSource)
                    }
                    className="mr-2"
                  />
                  <span>Use existing test drawings</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="upload"
                    checked={fileSource === 'upload'}
                    onChange={(e) =>
                      setFileSource(e.target.value as FileSource)
                    }
                    className="mr-2"
                  />
                  <span>Upload new files</span>
                </label>
              </div>
            </div>

            {/* Existing Drawings List */}
            {fileSource === 'existing' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">
                    Available Drawings ({drawings.length})
                  </h3>
                  <button
                    onClick={handleSelectAllDrawings}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {selectedDrawingIds.size === drawings.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded divide-y">
                  {drawings.map((drawing) => (
                    <label
                      key={drawing.drawingId}
                      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDrawingIds.has(drawing.drawingId)}
                        onChange={() => handleDrawingToggle(drawing.drawingId)}
                        className="mr-3"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {drawing.fileName}
                          </span>
                          {drawing.isConfidential && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              🔒 Confidential
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {drawing.type} • {drawing.quality}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Zone */}
            {fileSource === 'upload' && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <p className="text-gray-500 mb-4">
                  File upload will be implemented in the next step
                </p>
                <p className="text-sm text-gray-400">
                  Drag and drop PDFs or images here, or click to browse
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Summary & Submit */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Test Summary
              </h3>
              <div className="mt-2 text-sm text-gray-600">
                <p>
                  <strong>{selectedProcessors.size}</strong> processors
                  selected
                </p>
                <p>
                  <strong>{selectedDrawingIds.size}</strong> drawings selected
                </p>
                {estimatedCost > 0 && (
                  <p className="text-yellow-600 mt-1">
                    Estimated cost: ¥{estimatedCost.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={
                createTestRun.isPending ||
                selectedProcessors.size === 0 ||
                (fileSource === 'existing' && selectedDrawingIds.size === 0)
              }
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-lg font-semibold"
            >
              {createTestRun.isPending ? 'Creating Test Run...' : 'Run Test'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProcessorCheckboxProps {
  processorName: string;
  info: ProcessorInfo | undefined;
  checked: boolean;
  onChange: (processorName: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}

function ProcessorCheckbox({
  processorName,
  info,
  checked,
  onChange,
  disabled,
  disabledReason,
}: ProcessorCheckboxProps) {
  return (
    <label
      className={`flex items-start p-3 border rounded-lg ${
        disabled
          ? 'bg-gray-50 cursor-not-allowed'
          : 'hover:bg-gray-50 cursor-pointer'
      }`}
      title={disabledReason}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(processorName)}
        disabled={disabled}
        className="mt-1 mr-3"
      />
      <div className="flex-1">
        <div className="font-medium text-sm text-gray-900">
          {info?.displayName || processorName}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {info?.shortDescription || 'No description available'}
        </p>
        {info?.cost && (
          <p className="text-xs text-yellow-600 mt-1">{info.cost}</p>
        )}
        {disabled && disabledReason && (
          <p className="text-xs text-red-600 mt-1">{disabledReason}</p>
        )}
      </div>
    </label>
  );
}
