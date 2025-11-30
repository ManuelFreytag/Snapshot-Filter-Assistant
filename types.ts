
export interface EvaluationResult {
  compositionScore: number;
  lightingScore: number;
  technicalScore: number;
  artisticScore: number;
  totalScore: number;
  isWorthKeeping: boolean;
  feedback: string;
}

export type ProcessStatus = 'pending' | 'processing' | 'done' | 'error';

export interface ImageFile {
  id: string;
  handle: FileSystemFileHandle;
  name: string;
  type: string;
  status: ProcessStatus;
  evaluation?: EvaluationResult;
  xmpHandle?: FileSystemFileHandle; // Handle to existing sidecar if found
  errorMessage?: string;
  groupId?: string; // Optional: ID to group burst images
}

export enum ViewMode {
  GRID = 'GRID',
  FOCUS = 'FOCUS',
}
