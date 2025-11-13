import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type {
  APIResponse,
  Drawing,
  DrawingResults,
  ResultWithDetails,
  TestRun,
  TestRunDetails,
  SaveCorrectionsRequest,
  SaveCorrectionsResponse,
  VerificationStats,
  VerifyBBoxRequest,
  AddMissingTextRequest,
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

// Mutations
export const useDeleteTestRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteTestRun(id),
    onSuccess: () => {
      // Invalidate test runs query to refetch the list
      queryClient.invalidateQueries({ queryKey: ['test-runs'] });
    },
  });
};

export const useDeleteTestRuns = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => apiClient.deleteTestRuns(ids),
    onSuccess: () => {
      // Invalidate test runs query to refetch the list
      queryClient.invalidateQueries({ queryKey: ['test-runs'] });
    },
  });
};

export const useSaveCorrections = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resultId, corrections }: SaveCorrectionsRequest) =>
      apiClient.saveCorrections(resultId, corrections) as Promise<
        APIResponse<SaveCorrectionsResponse>
      >,
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['result', variables.resultId] });
      queryClient.invalidateQueries({ queryKey: ['test-run'] });
    },
  });
};

// Verification hooks (for confidential documents)
export const useVerificationStats = (resultId: string | undefined) => {
  return useQuery({
    queryKey: ['verification-stats', resultId],
    queryFn: () =>
      apiClient.getVerificationStats(resultId!) as Promise<APIResponse<VerificationStats>>,
    enabled: !!resultId,
  });
};

export const useVerifyBBox = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resultId, ...data }: VerifyBBoxRequest & { resultId: string }) =>
      apiClient.verifyBBox(resultId, data),
    onSuccess: (data, variables) => {
      // Invalidate verification stats and result to refetch
      queryClient.invalidateQueries({ queryKey: ['verification-stats', variables.resultId] });
      queryClient.invalidateQueries({ queryKey: ['result', variables.resultId] });
    },
  });
};

export const useAddMissingText = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resultId, ...data }: AddMissingTextRequest & { resultId: string }) =>
      apiClient.addMissingText(resultId, data),
    onSuccess: (data, variables) => {
      // Invalidate verification stats to refetch
      queryClient.invalidateQueries({ queryKey: ['verification-stats', variables.resultId] });
    },
  });
};

export const useDeleteMissingText = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resultId, missingTextId }: { resultId: string; missingTextId: string }) =>
      apiClient.deleteMissingText(resultId, missingTextId),
    onSuccess: (data, variables) => {
      // Invalidate verification stats to refetch
      queryClient.invalidateQueries({ queryKey: ['verification-stats', variables.resultId] });
    },
  });
};
