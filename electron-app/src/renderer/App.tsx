import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Settings from './pages/Settings';
import ModeA from './pages/ModeA';
import ModeB from './pages/ModeB';
import FloorPlan from './pages/FloorPlan';

type Page = 'mode-a' | 'mode-b' | 'floor-plan' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('mode-a');
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">{t('appName')}</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <button
                  onClick={() => setCurrentPage('mode-a')}
                  className={`${
                    currentPage === 'mode-a'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {t('navigation.pdfOcr')}
                </button>
                <button
                  onClick={() => setCurrentPage('mode-b')}
                  className={`${
                    currentPage === 'mode-b'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {t('navigation.textComparison')}
                </button>
                <button
                  onClick={() => setCurrentPage('floor-plan')}
                  className={`${
                    currentPage === 'floor-plan'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {t('navigation.floorPlan')}
                </button>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={() => setCurrentPage('settings')}
                className={`${
                  currentPage === 'settings'
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                } p-2 rounded-md`}
                title={t('navigation.settings')}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {currentPage === 'mode-a' && <ModeA />}
        {currentPage === 'mode-b' && <ModeB />}
        {currentPage === 'floor-plan' && <FloorPlan />}
        {currentPage === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
