import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiKeys } from '@shared/types';

export default function Settings() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { t, i18n } = useTranslation('settings');

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const keys = await window.electronAPI.getApiKeys();
      // Set default value for documentAiLocation if not present
      if (!keys.documentAiLocation) {
        keys.documentAiLocation = 'us';
      }
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
      // Convert ApiKeys to Record<string, string> by filtering out undefined and empty values
      const keysToSave: Record<string, string> = {};
      Object.entries(apiKeys).forEach(([key, value]) => {
        if (value !== undefined && value.trim().length > 0) {
          keysToSave[key] = value.trim(); // Trim to remove leading/trailing whitespace
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
    const updates: Partial<ApiKeys> = {
      [key]: value || undefined,
    };

    // Auto-extract project ID from Cloud Vision service account JSON
    if (key === 'cloudVisionServiceAccount' && value) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.project_id && (!apiKeys.cloudVisionProjectId || !apiKeys.cloudVisionProjectId.trim())) {
          updates.cloudVisionProjectId = parsed.project_id;
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Auto-extract project ID from Document AI service account JSON
    if (key === 'documentAiCredentials' && value) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.project_id && (!apiKeys.documentAiProjectId || !apiKeys.documentAiProjectId.trim())) {
          updates.documentAiProjectId = parsed.project_id;
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    setApiKeys((prev) => ({
      ...prev,
      ...updates,
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
      {/* Language Selection */}
      <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-md">
        <h4 className="font-medium text-indigo-900 mb-3">
          {t('language.title')}
        </h4>
        <select
          value={i18n.language}
          onChange={(e) => {
            const newLang = e.target.value;
            i18n.changeLanguage(newLang);
            localStorage.setItem('language', newLang);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="ja">{t('language.japanese')}</option>
          <option value="en">{t('language.english')}</option>
        </select>
        <p className="mt-2 text-xs text-indigo-600">
          {t('language.description')}
        </p>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">{t('title')}</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>{t('apiKeys.description')}</p>
          </div>

          <div className="mt-6 space-y-6">
            {/* Google Cloud Vision - Service Account (Recommended) */}
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-base font-semibold text-gray-900 mb-3">{t('cloudVision.title')}</h4>
              <p className="text-sm text-gray-600 mb-4">{t('cloudVision.chooseMethod')}</p>

              {/* Method 1: Service Account (Recommended) */}
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                <h5 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t('cloudVision.serviceAccount.recommended')}
                </h5>

                <div className="mb-3">
                  <label htmlFor="cloudVisionProjectId" className="block text-sm font-medium text-gray-700">
                    {t('cloudVision.serviceAccount.projectId')}
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="cloudVisionProjectId"
                      value={apiKeys.cloudVisionProjectId || ''}
                      onChange={(e) => handleChange('cloudVisionProjectId', e.target.value)}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                      placeholder={t('cloudVision.serviceAccount.projectIdPlaceholder')}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('cloudVision.serviceAccount.projectIdHint')}</p>
                </div>

                <div>
                  <label htmlFor="cloudVisionServiceAccount" className="block text-sm font-medium text-gray-700">
                    {t('cloudVision.serviceAccount.jsonLabel')}
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="cloudVisionServiceAccount"
                      rows={4}
                      value={apiKeys.cloudVisionServiceAccount || ''}
                      onChange={(e) => handleChange('cloudVisionServiceAccount', e.target.value)}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border font-mono text-xs"
                      placeholder='{"type": "service_account", "project_id": "...", ...}'
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('cloudVision.serviceAccount.jsonHint')}</p>
                </div>
              </div>

              {/* Method 2: API Key (Alternative) */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                <h5 className="text-sm font-semibold text-gray-700 mb-2">{t('cloudVision.apiKey.alternative')}</h5>
                <div>
                  <label htmlFor="googleCloudVision" className="block text-sm font-medium text-gray-700">
                    {t('cloudVision.apiKey.label')}
                  </label>
                  <div className="mt-1">
                    <input
                      type="password"
                      id="googleCloudVision"
                      value={apiKeys.googleCloudVision || ''}
                      onChange={(e) => handleChange('googleCloudVision', e.target.value)}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                      placeholder={t('cloudVision.apiKey.placeholder')}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('cloudVision.apiKey.warning')}</p>
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-500">{t('cloudVision.requiredFor')}</p>
            </div>

            {/* Azure Computer Vision */}
            <div>
              <label htmlFor="azureComputerVision" className="block text-sm font-medium text-gray-700">
                {t('azure.keyLabel')}
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  id="azureComputerVision"
                  value={apiKeys.azureComputerVision || ''}
                  onChange={(e) => handleChange('azureComputerVision', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder={t('azure.keyPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label htmlFor="azureEndpoint" className="block text-sm font-medium text-gray-700">
                {t('azure.endpointLabel')}
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="azureEndpoint"
                  value={apiKeys.azureEndpoint || ''}
                  onChange={(e) => handleChange('azureEndpoint', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder={t('azure.endpointPlaceholder')}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{t('azure.requiredFor')}</p>
            </div>

            {/* Google Gemini */}
            <div>
              <label htmlFor="googleGemini" className="block text-sm font-medium text-gray-700">
                {t('gemini.label')}
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  id="googleGemini"
                  value={apiKeys.googleGemini || ''}
                  onChange={(e) => handleChange('googleGemini', e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                  placeholder={t('gemini.placeholder')}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{t('gemini.requiredFor')}</p>
            </div>

            {/* Document AI */}
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-base font-semibold text-gray-900 mb-3">{t('documentAi.title')}</h4>
              <p className="text-sm text-gray-600 mb-4">
                {t('documentAi.createProcessor')}{' '}
                <a
                  href="https://console.cloud.google.com/ai/document-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  console.cloud.google.com/ai/document-ai
                </a>
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="documentAiProjectId" className="block text-sm font-medium text-gray-700">
                    {t('documentAi.projectId')}
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="documentAiProjectId"
                      value={apiKeys.documentAiProjectId || ''}
                      onChange={(e) => handleChange('documentAiProjectId', e.target.value)}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                      placeholder={t('documentAi.projectIdPlaceholder')}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('documentAi.projectIdHint')}</p>
                </div>

                <div>
                  <label htmlFor="documentAiProcessorId" className="block text-sm font-medium text-gray-700">
                    {t('documentAi.processorId')}
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="documentAiProcessorId"
                      value={apiKeys.documentAiProcessorId || ''}
                      onChange={(e) => handleChange('documentAiProcessorId', e.target.value)}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                      placeholder={t('documentAi.processorIdPlaceholder')}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('documentAi.processorIdHint')}</p>
                </div>

                <div>
                  <label htmlFor="documentAiLocation" className="block text-sm font-medium text-gray-700">
                    {t('documentAi.location')}
                  </label>
                  <div className="mt-1">
                    <select
                      id="documentAiLocation"
                      value={apiKeys.documentAiLocation || 'us'}
                      onChange={(e) => handleChange('documentAiLocation', e.target.value)}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                    >
                      <option value="us">{t('documentAi.locations.us')}</option>
                      <option value="eu">{t('documentAi.locations.eu')}</option>
                      <option value="asia-northeast1">{t('documentAi.locations.tokyo')}</option>
                      <option value="asia-southeast1">{t('documentAi.locations.singapore')}</option>
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('documentAi.locationHint')}</p>
                </div>

                <div>
                  <label htmlFor="documentAiCredentials" className="block text-sm font-medium text-gray-700">
                    {t('documentAi.serviceAccountJson')}
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
                  <p className="mt-1 text-xs text-gray-500">{t('documentAi.serviceAccountJsonHint')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {saving ? t('saveButton.saving') : t('saveButton.save')}
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
                {t('saveButton.success')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* API Key Status */}
      <div className="mt-6 bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">{t('processors.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProcessorStatus
              name={t('processors.cloudVision')}
              available={
                !!apiKeys.googleCloudVision ||
                (!!apiKeys.cloudVisionServiceAccount && !!apiKeys.cloudVisionProjectId)
              }
              category={t('processors.confidentialSafe')}
            />
            <ProcessorStatus
              name={t('processors.azure')}
              available={!!apiKeys.azureComputerVision && !!apiKeys.azureEndpoint}
              category={t('processors.confidentialSafe')}
            />
            <ProcessorStatus
              name={t('processors.documentAi')}
              available={
                !!apiKeys.documentAiProjectId &&
                !!apiKeys.documentAiCredentials &&
                !!apiKeys.documentAiProcessorId &&
                !!apiKeys.documentAiLocation
              }
              category={t('processors.confidentialSafe')}
            />
            <ProcessorStatus name={t('processors.geminiBased')} available={!!apiKeys.googleGemini} category={t('processors.experimental')} />
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
  const { t } = useTranslation('settings');

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
      <div>
        <div className="text-sm font-medium text-gray-900">{name}</div>
        <div className="text-xs text-gray-500">{category}</div>
      </div>
      {available ? (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          {t('processors.available')}
        </span>
      ) : (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          {t('processors.notConfigured')}
        </span>
      )}
    </div>
  );
}
