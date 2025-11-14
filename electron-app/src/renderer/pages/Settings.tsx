import { useState, useEffect } from 'react';
import type { ApiKeys } from '@shared/types';

export default function Settings() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const keys = await window.electronAPI.getApiKeys();
      setApiKeys(keys);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Convert ApiKeys to Record<string, string> by filtering out undefined values
      const keysToSave: Record<string, string> = {};
      Object.entries(apiKeys).forEach(([key, value]) => {
        if (value !== undefined) {
          keysToSave[key] = value;
        }
      });
      await window.electronAPI.saveApiKeys(keysToSave);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save API keys:', error);
      alert('Failed to save API keys. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof ApiKeys, value: string) => {
    setApiKeys((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">API Key Configuration</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>Configure your API keys for OCR and AI services. Keys are encrypted and stored locally on your machine.</p>
          </div>

          <div className="mt-6 space-y-6">
            {/* Google Cloud Vision */}
            <div>
              <label htmlFor="googleCloudVision" className="block text-sm font-medium text-gray-700">
                Google Cloud Vision API Key
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  id="googleCloudVision"
                  value={apiKeys.googleCloudVision || ''}
                  onChange={(e) => handleChange('googleCloudVision', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder="Enter your Google Cloud Vision API key"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Required for: Cloud Vision processor</p>
            </div>

            {/* Azure Computer Vision */}
            <div>
              <label htmlFor="azureComputerVision" className="block text-sm font-medium text-gray-700">
                Azure Cognitive Services Key
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  id="azureComputerVision"
                  value={apiKeys.azureComputerVision || ''}
                  onChange={(e) => handleChange('azureComputerVision', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder="Enter your Azure Cognitive Services key"
                />
              </div>
            </div>

            <div>
              <label htmlFor="azureEndpoint" className="block text-sm font-medium text-gray-700">
                Azure Endpoint URL
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="azureEndpoint"
                  value={apiKeys.azureEndpoint || ''}
                  onChange={(e) => handleChange('azureEndpoint', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder="https://your-region.api.cognitive.microsoft.com/"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Required for: Azure Read, Azure Layout processors</p>
            </div>

            {/* Google Gemini */}
            <div>
              <label htmlFor="googleGemini" className="block text-sm font-medium text-gray-700">
                Google Gemini API Key
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  id="googleGemini"
                  value={apiKeys.googleGemini || ''}
                  onChange={(e) => handleChange('googleGemini', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder="Enter your Google Gemini API key"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Required for: All Gemini-based processors, hybrid processors, and Floor Plan to Revit conversion</p>
            </div>

            {/* Document AI */}
            <div>
              <label htmlFor="documentAiProjectId" className="block text-sm font-medium text-gray-700">
                Document AI Project ID
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="documentAiProjectId"
                  value={apiKeys.documentAiProjectId || ''}
                  onChange={(e) => handleChange('documentAiProjectId', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder="your-project-id"
                />
              </div>
            </div>

            <div>
              <label htmlFor="documentAiCredentials" className="block text-sm font-medium text-gray-700">
                Document AI Service Account JSON
              </label>
              <div className="mt-1">
                <textarea
                  id="documentAiCredentials"
                  rows={4}
                  value={apiKeys.documentAiCredentials || ''}
                  onChange={(e) => handleChange('documentAiCredentials', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border font-mono text-xs"
                  placeholder='{"type": "service_account", ...}'
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Required for: Document AI processor. Paste the entire JSON content from your service account key file.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save API Keys'}
            </button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center">
                <svg className="h-5 w-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Saved successfully!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* API Key Status */}
      <div className="mt-6 bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Available Processors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProcessorStatus
              name="Cloud Vision"
              available={!!apiKeys.googleCloudVision}
              category="Confidential-safe"
            />
            <ProcessorStatus
              name="Azure Read & Layout"
              available={!!apiKeys.azureComputerVision && !!apiKeys.azureEndpoint}
              category="Confidential-safe"
            />
            <ProcessorStatus
              name="Document AI"
              available={!!apiKeys.documentAiProjectId && !!apiKeys.documentAiCredentials}
              category="Confidential-safe"
            />
            <ProcessorStatus name="All Gemini-based" available={!!apiKeys.googleGemini} category="Hybrids & Experimental" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessorStatus({
  name,
  available,
  category,
}: {
  name: string;
  available: boolean;
  category: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
      <div>
        <div className="text-sm font-medium text-gray-900">{name}</div>
        <div className="text-xs text-gray-500">{category}</div>
      </div>
      {available ? (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Available
        </span>
      ) : (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Not configured
        </span>
      )}
    </div>
  );
}
