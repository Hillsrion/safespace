export type PostStatus = 'active' | 'hidden';

export type SuccessResult<T extends string> = { 
  success: true; 
  action: T 
};

export type ErrorResult = { 
  success: false; 
  error: string 
};

export type ActionResult<T extends string> = SuccessResult<T> | ErrorResult;
