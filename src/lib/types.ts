// Message interface for chat messages
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageData[];
}

// OpenRouter API request interface
export interface OpenRouterRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

// OpenRouter API response interface
export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: Message;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Chat API request interface (for our Next.js API route)
export interface ChatRequest {
  messages: Message[];
  model?: 'mistral' | 'gemma';
}

// Chat API response interface
export interface ChatResponse {
  message: Message;
  error?: string;
}

// Interface untuk data gambar
export interface ImageData {
  id?: string;
  url: string;
  description?: string;
  processed?: boolean;
  progress?: number;
  status?: string;
  isUploading?: boolean;
}

// Interface untuk image processing request
export interface ImageProcessingRequest {
  imageUrl: string;
  userPrompt?: string;
}

// Interface untuk image description response
export interface ImageDescriptionResponse {
  description: string;
  objects: string[];
  colors: string[];
  text_content?: string;
  emotions?: string[];
  actions?: string[];
  context: string;
}
