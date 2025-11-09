import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import type {
  APIResponse,
  Drawing,
  DrawingResults,
  ResultWithDetails,
  TestRun,
  TestRunDetails,
} from '../types/api';

export const useDrawings = () => {
  return useQuery({
    queryKey: ['drawings'],
    queryFn: () => apiClient.getDrawings() as Promise<APIResponse<Drawing[]>>,
  });
};

export const useDrawing = (id: string | undefined) => {
  return useQuery({
    queryKey: ['drawing', id],
    queryFn: () => apiClient.getDrawing(id!) as Promise<APIResponse<Drawing>>,
    enabled: !!id,
  });
};

export const useDrawingResults = (id: string | undefined) => {
  return useQuery({
    queryKey: ['drawing-results', id],
    queryFn: () =>
      apiClient.getDrawingResults(id!) as Promise<APIResponse<DrawingResults>>,
    enabled: !!id,
  });
};

export const useResult = (id: string | undefined) => {
  return useQuery({
    queryKey: ['result', id],
    queryFn: () =>
      apiClient.getResult(id!) as Promise<APIResponse<ResultWithDetails>>,
    enabled: !!id,
  });
};

export const useTestRuns = () => {
  return useQuery({
    queryKey: ['test-runs'],
    queryFn: () => apiClient.getTestRuns() as Promise<APIResponse<TestRun[]>>,
  });
};

export const useTestRun = (id: string | undefined) => {
  return useQuery({
    queryKey: ['test-run', id],
    queryFn: () =>
      apiClient.getTestRun(id!) as Promise<APIResponse<TestRunDetails>>,
    enabled: !!id,
  });
};
