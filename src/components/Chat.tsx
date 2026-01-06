'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import { Message, ImageData, ImageDescriptionResponse } from '@/lib/types';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

interface ChatProps {
  className?: string;
}

export default function Chat({ className = '' }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<'mistral' | 'gemma'>('mistral');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasConversationSummary, setHasConversationSummary] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [internalSummary, setInternalSummary] = useState<Message | null>(null);

  // Image processing state
  const [uploadedImages, setUploadedImages] = useState<ImageData[]>([]);
  const isProcessingImage = uploadedImages.some(img => img.isUploading);
  const [aiResponseProgress, setAiResponseProgress] = useState(0);
  const [aiResponseStatus, setAiResponseStatus] = useState('');

  // DISABLED: Testing mode configuration
  /*
  const [isTestingMode, setIsTestingMode] = useState(false);

  // Load testing mode from localStorage on client-side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const testingMode = localStorage.getItem('testingMode') === 'true';
      setIsTestingMode(process.env.NODE_ENV === 'development' && testingMode);
    }
  }, []);
  */

  // Set testing mode to false (disabled)
  const isTestingMode = false;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Context window tracking (approximate) - adjusted for testing mode
  const MAX_CONTEXT_TOKENS = isTestingMode ? 15000 : 262144; // 15K for testing, 262K for production
  const estimateTokens = (text: string) => Math.ceil(text.length / 4); // Rough estimation
  const currentTokens = messages.reduce((total, msg) => total + estimateTokens(msg.content), 0);
  const contextUsagePercent = Math.min((currentTokens / MAX_CONTEXT_TOKENS) * 100, 100);

  // Load model preference from localStorage on mount
  useEffect(() => {
    const savedModel = localStorage.getItem('selectedModel') as 'mistral' | 'gemma' | null;
    if (savedModel && (savedModel === 'mistral' || savedModel === 'gemma')) {
      setSelectedModel(savedModel);
    }
  }, []);

  // Save model preference to localStorage when changed
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // DISABLED: Auto-summarize when context usage reaches threshold
  /*
  useEffect(() => {
    const checkContextAndSummarize = async () => {
      const currentTokens = messages.reduce((total, msg) => total + estimateTokens(msg.content), 0);
      const contextUsagePercent = (currentTokens / MAX_CONTEXT_TOKENS) * 100;

      // Trigger at 90% of context window for maximum utilization
      const triggerThreshold = 90;
      const minMessages = isTestingMode ? 2 : 6;

      if (contextUsagePercent >= triggerThreshold && !hasConversationSummary && messages.length > minMessages) {
        console.log('🎯 Auto-summarization triggered at 90% context usage');
        console.log(`📊 Context usage: ${contextUsagePercent.toFixed(1)}%`);
        console.log(`🔢 Current tokens: ${currentTokens}`);
        console.log(`📦 Target summary size: ${Math.floor(MAX_CONTEXT_TOKENS * 0.1).toLocaleString()} tokens (${Math.floor(MAX_CONTEXT_TOKENS * 0.1 / MAX_CONTEXT_TOKENS * 100)}%)`);

        if (isTestingMode) {
          console.log('🧪 Testing mode active - reduced context window');
        }

        await generateConversationSummary();
      }

      // Debug logging for all modes
      if (messages.length > 0 && contextUsagePercent > 70) {
        console.log(`📈 Context usage: ${contextUsagePercent.toFixed(1)}% (${currentTokens}/${MAX_CONTEXT_TOKENS} tokens)`);
      }
    };

    if (messages.length > 0) {
      checkContextAndSummarize();
    }
  }, [messages, hasConversationSummary, isTestingMode]);
  */

  // Focus input on component mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Simplifying math formatting to avoid aggressive regex replacement that breaks things
  // We primarily rely on the model following instructions to use $ and $$, but we handle standard LaTeX delimiters
  const formatMathContent = (content: string) => {
    if (!content) return content;

    return content
      // Handle standard LaTeX escaped delimiters
      .replace(/\\\((.*?)\\\)/g, '$$$1$$') // \(...\) -> $...$
      .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$') // \[...\] -> $$...$$
      // Handle cases where AI uses [ ... ] for math instead of \[ ... \]
      .replace(/\[\s*(\\[a-zA-Z]+[\s\S]*?)\s*\]/g, '$$$$$1$$$$')
      // Fix common AI hallucinations/typos in LaTeX
      .replace(/\\partia l/g, '\\partial')
      .replace(/\\delt a/g, '\\delta')
      .replace(/\\phi\s+/g, '\\phi ') // prevent trailing spaces in some cases
      .replace(/\\frac\s+{/g, '\\frac{');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!input.trim() && uploadedImages.length === 0) || isLoading || isProcessingImage) return;

    // Capture current values
    const currentInput = input.trim();
    const currentImages = [...uploadedImages];

    // Reset UI state immediately
    setInput('');
    setUploadedImages([]);

    // Prepare temporary message for UI display
    const userMessageForDisplay: Message = {
      role: 'user',
      content: currentInput,
      images: currentImages
    };

    // Update UI messages immediately
    setMessages(prev => [...prev, userMessageForDisplay]);

    setIsLoading(true);
    setAiResponseProgress(0);
    setError(null);

    try {
      // Progress: Preparing context (10%)
      setAiResponseProgress(10);
      setAiResponseStatus('Preparing context...');

      // Base system message for formatting and persona
      const baseSystemMessage: Message = {
        role: 'system',
        content: `Nama kamu adalah "Kacung". Kamu adalah asisten pribadi yang ramah.
        ATURAN PENTING:
        - JANGAN PERNAH memberitahu informasi tentang model AI kamu (seperti Mistral, Gemma, dll).
        - Jangan pernah sebutkan bahwa kamu adalah model AI.
        - Jika ditanya siapa kamu atau model apa kamu, jawablah bahwa kamu adalah Kacung.
        
        IMPORTANT MATH RULES:
        - Use standard LaTeX for all mathematical formulas. 
        - Use $...$ for inline math and $$...$$ for block math. 
        - NEVER use \\( \\) or \\[ \\] or bare brackets [ ].
        - DO NOT put spaces inside LaTeX commands (e.g., use \\partial not \\partia l).
        - If you see a complex formula, ALWAYS wrap it in $$...$$.
        
        GENERAL RULES:
        - ALWAYS respond in the same language as the user.
        - If just greeted, respond naturally without excessive capability listing.`
      };

      // Construct the actual message history for the API
      // We need to be careful not to send duplicates or circular logic
      let contextMessages: Message[] = [...messages];

      // Prepare the new message(s) to add
      const newMessagesToAdd: Message[] = [];

      // Add System Prompt for Image Analysis if needed
      if (currentImages.length > 0) {
        const imageDescriptions = currentImages
          .map((img, index) => `[IMAGE ${index + 1} ANALYSIS]:\n${img.description}`)
          .filter(Boolean)
          .join('\n\n');

        const analysisMessage: Message = {
          role: 'user', // Changed to user role to ensure models attend to it as context
          content: `[CONTEXT: IMAGE ANALYSIS] The user has provided ${currentImages.length} image(s). Here is the detailed analysis:\n\n${imageDescriptions}\n\n(Refer to these as Image 1, Image 2, etc. Use this context to answer the user's questions.)`
        };
        newMessagesToAdd.push(analysisMessage);
      }

      // Add the User's actual input
      const userMessageForApi: Message = {
        role: 'user',
        content: currentInput
      };
      newMessagesToAdd.push(userMessageForApi);

      // Combine for final context
      const finalContext = [
        baseSystemMessage,
        ...(internalSummary ? [internalSummary] : []),
        ...contextMessages,
        ...newMessagesToAdd
      ].map(msg => ({
        role: msg.role,
        content: msg.content
        // Sanitize: ensure no other fields go to API
      }));

      // Progress: Sending request (25%)
      setAiResponseProgress(25);
      setAiResponseStatus('Sending request to AI...');

      // Simulated progress crawl
      const progressInterval = setInterval(() => {
        setAiResponseProgress(prev => {
          if (prev >= 85) return prev;
          return prev + 1;
        });
      }, 500);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: finalContext,
          model: selectedModel,
        }),
      });

      clearInterval(progressInterval);

      // Progress: Processing response (85%)
      setAiResponseProgress(85);
      setAiResponseStatus('Processing AI response...');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get response');
      }

      const data = await response.json();

      // Progress: Finalizing (100%)
      setAiResponseProgress(100);
      setAiResponseStatus('Response received');

      const assistantMessage: Message = data.message;

      // Update state with the *actual* messages including hidden system ones if we want to keep context
      // BUT for UI, we usually just want to append the assistant response.
      // However, if we don't save the system analysis message, the AI will forget about the image in the next turn.
      // So we MUST save it to 'messages' state but hide it in render.

      setMessages(prev => {
        // We already added userMessageForDisplay.
        // Now we need to add the hidden analysis message ONLY IF it existed
        const msgs = [...prev];

        // Note: we can't easily insert *before* the last user message without re-constructing.
        // Actually, earlier we did: setMessages(prev => [...prev, userMessageForDisplay]);
        // So 'msgs' has the user message at the end.

        // If we had image analysis, insert it before the user message for correct order in history
        // or just append it before assistant message? 
        // Most logical: [History] [Analysis] [User] [Assistant]

        // To achieve this cleanly with React state updates being async:
        // We should probably have updated state *once* at the end or carefully managed it.

        // Let's correct the flow:
        // 1. We added UserMessage.
        // 2. Now we receive AssistantMessage.
        // 3. We also want to persist the Analysis message if it existed.

        // Retrospective fix:
        // Find the UserMessage we just added? It's the last one.

        const newHistory = [...msgs];

        if (currentImages.length > 0) {
          // Re-create the analysis message to store in history
          const imageDescriptions = currentImages
            .map((img, index) => `[IMAGE ${index + 1} ANALYSIS]:\n${img.description}`)
            .filter(Boolean)
            .join('\n\n');
          const analysisMsg: Message = {
            role: 'user',
            content: `[CONTEXT: IMAGE ANALYSIS] The user has provided images. Here is the detailed analysis:\n${imageDescriptions}\n\n(Use this information to answer the user's questions about the images.)`
          };

          // Insert before the last message (which is the User message)
          // history: [..., UserMsg]
          // desired: [..., AnalysisMsg, UserMsg, AssistantMsg]

          const lastMsg = newHistory.pop(); // UserMsg
          if (lastMsg) {
            newHistory.push(analysisMsg);
            newHistory.push(lastMsg);
          }
        }

        newHistory.push(assistantMessage);
        return newHistory;
      });

      // Reset progress after response is shown
      setTimeout(() => {
        setAiResponseProgress(0);
        setAiResponseStatus('');
      }, 1000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      console.error('Chat error:', err);
      setAiResponseProgress(0);
      // Remove the optimistically added user message if request failed? 
      // Better to leave it so user can copy/retry.
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInternalSummary(null);
    setUploadedImages([]);
    setAiResponseProgress(0);
    setError(null);
    setHasConversationSummary(false);
    setIsSummarizing(false);
    inputRef.current?.focus();
  };

  // Image upload handler
  const handleImageUpload = async (file: File) => {
    if (!file) return;

    // Validasi tipe file
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file');
      return;
    }

    // Validasi ukuran file (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size must be less than 10MB');
      return;
    }

    const imageId = Math.random().toString(36).substring(7);
    const initialImageData: ImageData = {
      id: imageId,
      url: '', // Placeholder until we get base64
      isUploading: true,
      progress: 0,
      status: 'Starting...'
    };

    setUploadedImages(prev => [...prev, initialImageData]);

    const updateImage = (updates: Partial<ImageData>) => {
      setUploadedImages(prev => prev.map(img =>
        img.id === imageId ? { ...img, ...updates } : img
      ));
    };

    try {
      // Progress: Converting file (15%)
      updateImage({ progress: 15, status: 'Converting...' });

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          updateImage({ progress: 30, status: 'Processing data...', url: reader.result as string });
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Progress: Sending to vision API (40%)
      updateImage({ progress: 40, status: 'Analyzing Image...' });

      // Simulated crawl (40% to 80%)
      const progressInterval = setInterval(() => {
        setUploadedImages(prev => prev.map(img => {
          if (img.id === imageId && img.progress !== undefined && img.progress < 80) {
            return { ...img, progress: img.progress + 1 };
          }
          return img;
        }));
      }, 300);

      const processResponse = await fetch('/api/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: base64,
          userPrompt: input.trim()
        }),
      });

      clearInterval(progressInterval);

      if (!processResponse.ok) {
        const errorData = await processResponse.json().catch(() => ({}));
        const errorMsg = errorData.error || `Server error: ${processResponse.status}`;
        throw new Error(errorMsg);
      }

      // Progress: Processing response (90%)
      updateImage({ progress: 90, status: 'Finalizing...' });
      const processData = await processResponse.json();
      const imageDescription: ImageDescriptionResponse = processData.description;

      // Progress: Finalizing (100%)
      updateImage({
        progress: 100,
        status: 'Complete',
        description: JSON.stringify(imageDescription),
        processed: true,
        isUploading: false
      });

      // Reset progress feedback after a short delay (keep description and url)
      setTimeout(() => {
        updateImage({ progress: undefined, status: undefined });
      }, 2000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process image';
      setError(errorMessage);
      console.error('Image upload error:', err);
      // Remove the image if it failed
      setUploadedImages(prev => prev.filter(img => img.id !== imageId));
    }
  };

  // Remove image handler
  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Paste handler
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          handleImageUpload(file);
        }
      }
    }
  };

  // DISABLED: generateConversationSummary function
  /*
  const generateConversationSummary = async () => {
    if (messages.length < 4) return;

    setIsLoading(true);
    setIsSummarizing(true);

    try {
      const conversationText = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      const targetSummaryTokens = Math.floor(MAX_CONTEXT_TOKENS * 0.1); // 10% of context window

    // Extract key topics from recent messages for continuity
    const extractKeyTopics = (recentMsgs: Message[]) => {
      const topics = new Set<string>();
      recentMsgs.forEach(msg => {
        const content = msg.content.toLowerCase();
        // Extract potential topics from message content
        if (content.includes('api') || content.includes('integrat')) topics.add('API Integration');
        if (content.includes('ui') || content.includes('design') || content.includes('interfac')) topics.add('UI/UX Design');
        if (content.includes('database') || content.includes('data')) topics.add('Database Management');
        if (content.includes('security') || content.includes('auth')) topics.add('Security & Authentication');
        if (content.includes('performance') || content.includes('optimization')) topics.add('Performance Optimization');
        if (content.includes('deployment') || content.includes('devops')) topics.add('Deployment & DevOps');
        if (content.includes('testing') || content.includes('test')) topics.add('Testing & Quality Assurance');
        if (content.includes('model') || content.includes('ai') || content.includes('chatbot')) topics.add('AI/ML Models');
        if (content.includes('react') || content.includes('component')) topics.add('React Development');
        if (content.includes('typescript') || content.includes('type')) topics.add('TypeScript Implementation');
      });
      return Array.from(topics).slice(0, 3); // Limit to 3 most relevant topics
    };

    const recentMessages = messages.slice(-5); // Get last 5 messages for topic extraction
    const keyTopics = extractKeyTopics(recentMessages);

    const detailedSummaryPrompt = `You are creating a comprehensive conversation summary for context compression. Respond ONLY with the summary content - do not repeat this prompt or add any meta-commentary.

Create a detailed summary of approximately ${targetSummaryTokens.toLocaleString()} tokens (${Math.floor(targetSummaryTokens * 0.75).toLocaleString()} words) covering:

**EXECUTIVE SUMMARY**
• Overall theme and purpose
• Key outcomes and decisions
• User's main goals and preferences

**DETAILED TOPICS DISCUSSED**
• Technical specifications, requirements, constraints
• Alternatives considered and decisions made

**USER PREFERENCES & REQUIREMENTS**
• Technical preferences, pain points, success criteria

**IMPLEMENTATION DETAILS**
• Code, APIs, UI/UX decisions, performance considerations

**ACTION ITEMS & NEXT STEPS**
• Immediate tasks, future enhancements, open questions

**KEY INSIGHTS & LESSONS LEARNED**
• Important discoveries, best practices, recommendations

**CONVERSATION FLOW TIMELINE**
• Chronological progression and turning points

CRITICAL: Preserve awareness of these key topics for continuity: ${keyTopics.join(', ')}

Conversation to summarize:
${conversationText}`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: detailedSummaryPrompt }],
          model: selectedModel,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const summaryMessage: Message = {
          role: 'system',
          content: `${data.message.content}`
        };

        // Store summary internally for AI context, don't display it
        setInternalSummary(summaryMessage);
        setHasConversationSummary(true);
        setIsSummarizing(false);

        // Clear visible messages but keep summary in internal context
        setMessages([]);

        // Add notification after a brief delay
        setTimeout(() => {
          const summaryPercentage = Math.floor(targetSummaryTokens / MAX_CONTEXT_TOKENS * 100);
          const originalTokens = currentTokens;
          const savedTokens = originalTokens - targetSummaryTokens;
          const messageCount = messages.length;

          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ Context optimized - ${Math.floor(savedTokens/originalTokens*100)}% space saved for continued conversation.`
          }]);
        }, 500);

      }
    } catch (err) {
      console.error('Summary generation failed:', err);
      setIsSummarizing(false);
    } finally {
      setIsLoading(false);
    }
  };
  */

  return (
    <div className={`flex flex-col h-full w-full bg-gradient-to-br from-blue-50 via-white to-indigo-50 ${className}`}>
      {/* Header */}
      <div className="backdrop-blur-md bg-white/80 border-b border-white/20 px-3 sm:px-6 py-3 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="relative">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L19 6.6C18.8 6 18.5 5.4 18.1 4.9L19 3L17 1L15.4 1.9C14.9 1.5 14.3 1.2 13.7 1L13.4 0H10.6L10.3 1C9.7 1.2 9.1 1.5 8.6 1.9L7 1L5 3L5.9 4.9C5.5 5.4 5.2 6 5 6.6L3 7V9L5 9.4C5.2 10 5.5 10.6 5.9 11.1L5 13L7 15L8.6 14.1C9.1 14.5 9.7 14.8 10.3 15L10.6 16H13.4L13.7 15C14.3 14.8 14.9 14.5 15.4 14.1L17 15L19 13L18.1 11.1C18.5 10.6 18.8 10 19 9.4L21 9ZM12 8C13.66 8 15 9.34 15 11C15 12.66 13.66 14 12 14C10.34 14 9 12.66 9 11C9 9.34 10.34 8 12 8Z" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-400 rounded-full border-2 border-white shadow-sm">
                <div className="w-full h-full bg-green-400 rounded-full animate-pulse"></div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <h1 className="text-base sm:text-lg font-bold text-gray-800 font-['Inter'] truncate">Kacung</h1>
                <div className="flex items-center space-x-1">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full"></div>
                  <span className="text-xs text-green-600 font-medium hidden sm:inline">Online</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                <div className="flex items-center space-x-1">
                  <p className="text-xs text-gray-500 font-['Inter'] truncate">
                    {selectedModel === 'mistral' ? 'Kacung V1' : 'Kacung V2 (Update)'}
                  </p>
                  {/* DISABLED: Testing mode indicator */}
                  {/*
                  {isTestingMode && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium animate-pulse">
                      TEST
                    </span>
                  )}
                  */}
                </div>
                {/* DISABLED: Context info indicator */}
                {/*
                <div className="flex items-center space-x-1 mt-0.5 sm:mt-0">
                  <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                  <span className="text-xs text-gray-400 font-['Inter']">
                    {isTestingMode ? '15K' : '262K'} context
                  </span>
                </div>
                */}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            {/* Custom Model Selector */}
            <div className="hidden sm:flex items-center relative" ref={dropdownRef}>
              <button
                onClick={() => !isLoading && setIsDropdownOpen(!isDropdownOpen)}
                disabled={isLoading}
                className="bg-white/60 backdrop-blur-md border border-white/40 rounded-xl px-4 py-2 text-xs font-['Inter'] font-medium text-gray-700 hover:bg-white/80 hover:border-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300 transition-all duration-200 flex items-center space-x-2 min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                <div className="flex items-center space-x-2 flex-1">
                  <div className={`w-2 h-2 rounded-full ${selectedModel === 'mistral' ? 'bg-blue-500' : 'bg-green-500'
                    }`}></div>
                  <span className="truncate">
                    {selectedModel === 'mistral' ? 'Kacung V1' : 'Kacung V2'}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''
                    }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl py-2 px-2 z-50 animate-dropdownFadeIn">
                  <div className="px-2 pb-2 mb-2 border-b border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-1">
                      Choose AI Model
                    </div>
                  </div>

                  {/* Kacung V1 Option */}
                  <button
                    onClick={() => {
                      setSelectedModel('mistral');
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-4 text-left hover:bg-blue-50/80 transition-colors duration-150 flex items-start space-x-3 rounded-xl ${selectedModel === 'mistral' ? 'bg-blue-100/80 border-l-4 border-blue-500' : ''
                      }`}
                  >
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="w-3 h-3 bg-blue-500 rounded-full shadow-sm mt-0.5 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 font-['Inter']">
                          Kacung V1
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          <span className="text-blue-600 font-medium">Balanced Performance</span><br />
                          <span className="text-gray-400">Reliable & Fast Responses</span>
                        </div>
                      </div>
                    </div>
                    {selectedModel === 'mistral' && (
                      <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {/* Kacung V2 Option */}
                  <button
                    onClick={() => {
                      setSelectedModel('gemma');
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-4 text-left hover:bg-green-50/80 transition-colors duration-150 flex items-start space-x-3 rounded-xl ${selectedModel === 'gemma' ? 'bg-green-100/80 border-l-4 border-green-500' : ''
                      }`}
                  >
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="w-3 h-3 bg-green-500 rounded-full shadow-sm mt-0.5 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 font-['Inter']">
                          Kacung V2
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          <span className="text-green-600 font-medium">Latest Technology</span><br />
                          <span className="text-gray-400">Advanced AI Capabilities</span>
                        </div>
                      </div>
                    </div>
                    {selectedModel === 'gemma' && (
                      <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {/* Footer */}
                  <div className="px-4 pt-3 mt-2 border-t border-gray-100">
                    <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
                      <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-medium">262K Context Window</span>
                      <span className="text-gray-400">•</span>
                      <span>Free Models</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* DISABLED: Context Usage Indicator */}
            {/*
            <div className="hidden sm:flex items-center space-x-2 bg-white/50 backdrop-blur-sm rounded-lg px-3 py-1.5 group relative cursor-help ml-2">
              <div className="flex flex-col items-start">
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${
                    contextUsagePercent > 80 ? 'bg-red-500' :
                    contextUsagePercent > 60 ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}></div>
                  <span className="text-xs text-gray-600 font-['Inter'] font-medium">
                    {Math.round(contextUsagePercent)}%
                  </span>
                </div>
                <span className="text-xs text-gray-500 font-['Inter'] leading-none">
                  {currentTokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} tokens
                </span>
              </div>
      {hasConversationSummary && (
        <div className="flex items-center mt-1">
          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
            {Math.floor(MAX_CONTEXT_TOKENS * 0.1).toLocaleString()}
          </span>
        </div>
      )}
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    contextUsagePercent > 80 ? 'bg-red-500' :
                    contextUsagePercent > 60 ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${contextUsagePercent}%` }}
                ></div>
              </div>

              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-4 py-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 min-w-[220px]">
                <div className="text-center">
                  <div className="font-semibold text-sm mb-2">Context Usage Details</div>
                  <div className="text-left space-y-1 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Model:</span>
                      <span className="font-medium text-blue-300">
                        {selectedModel === 'mistral' ? 'Kacung V1' : 'Kacung V2'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Summary:</span>
                      <span className={`font-medium ${hasConversationSummary ? 'text-purple-300' : 'text-gray-400'}`}>
                        {hasConversationSummary ? `${Math.floor(MAX_CONTEXT_TOKENS * 0.1).toLocaleString()} Active` : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Trigger:</span>
                      <span className="font-medium text-blue-300">
                        90%
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-gray-600 pt-2 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Used:</span>
                      <span className="font-mono text-blue-300">
                        {currentTokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Total:</span>
                      <span className="font-mono text-gray-200">
                        {MAX_CONTEXT_TOKENS.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Percentage:</span>
                      <span className={`font-mono ${
                        contextUsagePercent > 80 ? 'text-red-300' :
                        contextUsagePercent > 60 ? 'text-yellow-300' : 'text-green-300'
                      }`}>
                        {Math.round(contextUsagePercent)}%
                      </span>
                    </div>
                    <div className="border-t border-gray-600 mt-2 pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Words ≈</span>
                        <span className="font-mono text-gray-300">
                          {Math.round(currentTokens * 0.75).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
            */}

            {/* Clear Chat Button */}
            {/* DISABLED: Testing Mode Toggle (Hidden feature - triple click header) */}
            {/*
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                const newMode = !isTestingMode;
                localStorage.setItem('testingMode', newMode.toString());
                setIsTestingMode(newMode);
                // Optional: reload if needed for full effect
                // window.location.reload();
              }
            }}
            className={`hidden sm:flex px-2 py-1 text-xs rounded-md transition-colors ${
              isTestingMode
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={isTestingMode ? 'Disable Testing Mode' : 'Enable Testing Mode'}
          >
            🧪
          </button>
          */}

            <button
              onClick={clearChat}
              className="px-3 py-2 sm:px-4 text-sm text-gray-600 hover:text-gray-800 hover:bg-white/50 rounded-xl transition-all duration-200 backdrop-blur-sm"
              disabled={isLoading}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* DISABLED: Summarization Status Message */}
        {/*
        {isSummarizing && !isTestingMode && (
          <div className="flex justify-center animate-fadeInSlideUp">
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 backdrop-blur-sm border border-purple-300/30 rounded-2xl px-6 py-4 shadow-lg max-w-md">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent"></div>
                <div className="text-sm">
                  <div className="font-semibold text-purple-700">🧠 AI is compressing context...</div>
                  <div className="text-purple-600 text-xs mt-1">Optimizing memory for longer conversations</div>
                </div>
              </div>
            </div>
          </div>
        )}
        */}

        {messages.length === 0 && !isLoading && (
          <div className="text-center text-gray-500 py-8 sm:py-12">
            <div className="mb-4 sm:mb-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 sm:mb-3 font-['Inter']">Welcome to AI Assistant!</h3>
              <p className="text-sm text-gray-500 max-w-xs sm:max-w-sm mx-auto px-4 mb-2">
                Start a conversation by typing a message below. I support rich formatting with Markdown for better responses.
                {/* DISABLED: Testing mode indicator in welcome message */}
                {/*
                {isTestingMode && (
                  <span className="block mt-2 text-orange-600 font-medium">
                    🧪 Testing Mode Active: Reduced context window (15K)
                  </span>
                )}
                */}
              </p>
              <div className="flex items-center justify-center space-x-2 text-xs text-gray-400 mb-2">
                <div className="flex items-center space-x-1">
                  <span className="font-mono bg-gray-200 text-gray-700 px-1 rounded text-xs">**bold**</span>
                  <span className="font-mono bg-gray-200 text-gray-700 px-1 rounded text-xs">*italic*</span>
                  <span className="font-mono bg-gray-200 text-gray-700 px-1 rounded text-xs">`code`</span>
                </div>
              </div>
              {/* DISABLED: Context information */}
              {/*
              <div className="flex items-center justify-center space-x-2 text-xs text-gray-400 mb-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Context: {isTestingMode ? '15,000' : '262,144'} tokens • ~{isTestingMode ? '12,000' : '200,000'} words • Current: {currentTokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
              </div>
              */}
              {/* DISABLED: Context usage warning */}
              {/*
              {contextUsagePercent > 50 && (
                <div className={`flex items-center justify-center space-x-2 text-xs px-3 py-1 rounded-full ${
                  contextUsagePercent > 80 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
                }`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span>
                    {contextUsagePercent > 80 ? 'Context almost full!' : 'Context usage high'}
                  </span>
                </div>
              )}
              */}
            </div>
          </div>
        )}

        {messages.filter(m => m.role !== 'system' && !m.content.startsWith('[HIDDEN_ANALYSIS]') && !m.content.startsWith('[CONTEXT: IMAGE ANALYSIS]')).map((message, index) => (
          <div
            key={index}
            className={`flex animate-fadeInSlideUp ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div
              className={`max-w-[280px] sm:max-w-xs md:max-w-sm lg:max-w-md xl:max-w-lg px-4 sm:px-5 py-3 shadow-lg ${message.role === 'user'
                ? 'bg-gradient-to-r from-blue-400 to-blue-600 text-white rounded-[20px_20px_4px_20px]'
                : message.role === 'system'
                  ? 'bg-purple-50/90 backdrop-blur-sm text-purple-800 rounded-[16px] border border-purple-200/50'
                  : 'bg-white/90 backdrop-blur-sm text-gray-800 rounded-[20px_20px_20px_4px] border border-white/20'
                }`}
            >
              {message.role === 'user' ? (
                <div>
                  {message.images && message.images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {message.images.map((image, imgIndex) => (
                        <div key={imgIndex} className="relative">
                          <img
                            src={image.url}
                            alt={`User uploaded image ${imgIndex + 1}`}
                            className="w-16 h-16 object-cover rounded-lg border border-white/20"
                          />
                          <div className="absolute top-0 left-0 bg-blue-500/80 text-white text-[10px] font-bold px-1 rounded-br-lg rounded-tl-lg">
                            {imgIndex + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-['Inter']">{message.content}</p>
                </div>
              ) : message.role === 'system' ? (
                <div className="text-xs text-purple-700 font-['Inter'] leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeHighlight, rehypeKatex]}
                    components={{
                      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5 text-xs">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-0.5 text-xs">{children}</ol>,
                      li: ({ children }) => <li className="text-xs">{children}</li>,
                    }}
                  >
                    {formatMathContent(message.content)}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none font-['Inter'] prose-headings:text-gray-800 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-blue-600 prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-blockquote:border-l-blue-500 prose-blockquote:text-gray-600">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeHighlight, rehypeKatex]}
                    components={{
                      h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
                      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 my-2 bg-blue-50/50 py-2 rounded-r">
                          {children}
                        </blockquote>
                      ),
                      code: (props: any) => {
                        const { node, inline, className, children, ...rest } = props;
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <code className={className} {...rest}>
                            {children}
                          </code>
                        ) : (
                          <code className="bg-gray-200 text-red-600 px-1 py-0.5 rounded text-sm font-mono" {...rest}>
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto text-sm my-2 border border-gray-700">
                          {children}
                        </pre>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full border border-gray-300 rounded">{children}</table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="border border-gray-300 px-3 py-2 bg-gray-100 text-left font-semibold">{children}</th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-gray-300 px-3 py-2">{children}</td>
                      ),
                    }}
                  >
                    {formatMathContent(message.content)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start animate-fadeInSlideUp">
            <div className="bg-white/90 backdrop-blur-sm border border-white/20 px-5 py-3 rounded-[20px_20px_20px_4px] shadow-lg">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-sm text-gray-600 font-['Inter']">
                    {aiResponseStatus || 'AI is responding...'} ({aiResponseProgress}%)
                  </span>
                </div>
                {aiResponseProgress > 0 && (
                  <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-500 ease-out"
                      style={{ width: `${aiResponseProgress}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center animate-fadeInSlideUp">
            <div className="bg-red-50/90 backdrop-blur-sm border border-red-200/50 text-red-700 px-5 py-3 rounded-2xl max-w-md shadow-lg">
              <p className="text-sm font-['Inter']">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="backdrop-blur-md bg-white/80 border-t border-white/20 px-3 sm:px-6 py-4 sm:py-6 flex-shrink-0">
        <div className="w-full max-w-none">
          {/* Display uploaded images */}
          {uploadedImages.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {uploadedImages.map((image, index) => (
                <div key={index} className="relative group">
                  {image.url ? (
                    <img
                      src={image.url}
                      alt={`Uploaded image ${index + 1}`}
                      className={`w-20 h-20 object-cover rounded-lg border border-gray-300 transition-opacity ${image.isUploading ? 'opacity-40' : 'opacity-100'}`}
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                    </div>
                  )}
                  <div className="absolute top-0 left-0 bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-br-lg rounded-tl-lg shadow-sm">
                    {index + 1}
                  </div>

                  {image.isUploading && (
                    <div className="absolute inset-x-0 bottom-0 p-1">
                      <div className="bg-white/80 backdrop-blur-sm rounded-md p-1">
                        <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full transition-all duration-300 ease-out"
                            style={{ width: `${image.progress || 0}%` }}
                          ></div>
                        </div>
                        <div className="text-[7px] text-blue-600 font-bold truncate mt-1 text-center">
                          {image.status}
                        </div>
                      </div>
                    </div>
                  )}

                  {!image.isUploading && (
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity border-2 border-white shadow-sm"
                    >
                      ×
                    </button>
                  )}
                  {image.processed && !image.isUploading && (
                    <div className="absolute bottom-1 right-1 bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs shadow-sm shadow-black/20">
                      ✓
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-end space-x-2 sm:space-x-4 bg-white/90 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-xl border border-white/30 p-2">
              {/* Hidden file input */}
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    Array.from(files).forEach(file => handleImageUpload(file));
                  }
                  e.target.value = ''; // Reset input
                }}
                className="hidden"
                id="image-upload"
                disabled={isLoading}
              />

              {/* Image upload button */}
              <div className="flex flex-col items-center space-y-1">
                <label
                  htmlFor="image-upload"
                  className={`p-2 sm:p-3 text-gray-400 hover:text-blue-500 transition-colors duration-200 rounded-xl sm:rounded-2xl hover:bg-blue-50 cursor-pointer ${isLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </label>
              </div>

              {/* Text input */}
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message or describe the image..."
                  onPaste={handlePaste}
                  className="w-full px-3 sm:px-4 py-3 sm:py-4 bg-transparent border-0 outline-none text-gray-700 placeholder-gray-400 font-['Inter'] text-sm sm:text-base"
                  disabled={isLoading}
                />
              </div>

              {/* Send button */}
              <button
                type="submit"
                disabled={(!input.trim() && uploadedImages.length === 0) || isLoading || isProcessingImage}
                className="p-2 sm:p-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl sm:rounded-2xl hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
