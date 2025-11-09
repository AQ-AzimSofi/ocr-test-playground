const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class APIClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Drawings endpoints
  async getDrawings() {
    return this.request('/api/drawings');
  }

  async getDrawing(id: string) {
    return this.request(`/api/drawings/${id}`);
  }

  async getDrawingResults(id: string) {
    return this.request(`/api/drawings/${id}/results`);
  }

  // Results endpoints
  async getResult(id: string) {
    return this.request(`/api/results/${id}`);
  }

  async getResultBBoxSummary(id: string) {
    return this.request(`/api/results/${id}/bbox-summary`);
  }

  // Test runs endpoints
  async getTestRuns() {
    return this.request('/api/test-runs');
  }

  async getTestRun(id: string) {
    return this.request(`/api/test-runs/${id}`);
  }

  // Image URL helper
  getImageURL(filePathOrName: string) {
    // If it's a full path, extract the relative path after 'test-drawings/'
    if (filePathOrName.includes('test-drawings/')) {
      const relativePath = filePathOrName.split('test-drawings/')[1];
      return `${this.baseURL}/static/drawings/${relativePath}`;
    }
    // If it's already a relative path or just filename with subdirectory
    return `${this.baseURL}/static/drawings/${filePathOrName}`;
  }
}

export const apiClient = new APIClient(API_BASE_URL);
