import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProcessorInput {
  id: string;
  processor: string;
  text: string;
}

export default function ModeB() {
  const { t, i18n } = useTranslation('modeB');
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
      alert(t('processorInputs.minProcessorAlert'));
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
      alert(t('alerts.noGroundTruth'));
      return;
    }

    const validInputs = processorInputs.filter(
      (p) => p.processor.trim() && p.text.trim()
    );

    if (validInputs.length === 0) {
      alert(t('alerts.noProcessorInput'));
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
        language: i18n.language,
      });

      if (result.success && result.reportPath) {
        alert(t('alerts.comparisonSuccess', { reportPath: result.reportPath }));

        // Open the report
        await window.electronAPI.openPath(result.reportPath);
      } else {
        alert(t('alerts.comparisonFailed', { error: result.error }));
      }
    } catch (error: any) {
      alert(t('alerts.error', { message: error.message }));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {t('title')}
        </h2>
        <p className="text-gray-600 mb-6">
          {t('description')}
        </p>

        {/* Ground Truth Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {t('groundTruth.heading')}
          </h3>
          <textarea
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
            disabled={processing}
            className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 font-mono text-sm"
            placeholder={t('groundTruth.placeholder')}
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('groundTruth.characterCount', { count: groundTruth.length })}
          </p>
        </div>

        {/* Processor Outputs Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('processorInputs.heading')}
            </h3>
            <button
              onClick={addProcessorInput}
              disabled={processing}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {t('processorInputs.addButton')}
            </button>
          </div>

          <div className="space-y-4">
            {processorInputs.map((input, index) => (
              <div key={input.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-700">
                    {t('processorInputs.processorLabel', { number: index + 1 })}
                  </h4>
                  <button
                    onClick={() => removeProcessorInput(input.id)}
                    disabled={processing || processorInputs.length === 1}
                    className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('processorInputs.removeButton')}
                  </button>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('processorInputs.nameLabel')}
                  </label>
                  <input
                    type="text"
                    value={input.processor}
                    onChange={(e) =>
                      updateProcessorInput(input.id, 'processor', e.target.value)
                    }
                    disabled={processing}
                    placeholder={t('processorInputs.namePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('processorInputs.textLabel')}
                  </label>
                  <textarea
                    value={input.text}
                    onChange={(e) =>
                      updateProcessorInput(input.id, 'text', e.target.value)
                    }
                    disabled={processing}
                    placeholder={t('processorInputs.textPlaceholder')}
                    className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t('processorInputs.characterCount', { count: input.text.length })}
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
          {processing ? t('buttons.processing') : t('buttons.runComparison')}
        </button>

        {/* Info */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="font-medium text-gray-900 mb-2">{t('features.title')}</h4>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            {t('features.items', { returnObjects: true }).map((item: any, index: number) => (
              <li key={index}>
                <strong>{item.label}</strong> {item.description}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="font-medium text-blue-900 mb-2">{t('howItWorks.title')}</h4>
          <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
            {t('howItWorks.steps', { returnObjects: true }).map((step: string, index: number) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <p className="text-xs text-blue-600 mt-2">
            <strong>Tip:</strong> {t('tips.text')}
          </p>
        </div>
      </div>
    </div>
  );
}
