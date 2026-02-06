
export interface Piece {
  id: string;
  originalX: number; // grid position x
  originalY: number; // grid position y
  currentX: number;
  currentY: number;
  width: number; // in grid cells
  height: number; // in grid cells
  imageUrl?: string;
  videoUrl?: string;
  isLocked: boolean;
}

export interface PuzzleConfig {
  gridSize: number; // e.g. 10x10
  imageSrc: string;
}

export enum Difficulty {
  Easy = 'Easy',
  Medium = 'Medium',
  Hard = 'Hard',
}
