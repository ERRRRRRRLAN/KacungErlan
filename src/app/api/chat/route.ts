import { NextRequest, NextResponse } from 'next/server';
import { ChatRequest, ChatResponse, OpenRouterRequest, OpenRouterResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body: ChatRequest = await request.json();

    // Validate request
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required and cannot be empty' },
        { status: 400 }
      );
    }

    // Get environment variables
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key is not configured' },
        { status: 500 }
      );
    }

    // Select model based on request parameter
    const modelMap = {
      mistral: 'mistralai/devstral-2512:free',
      gemma: 'xiaomi/mimo-v2-flash:free'
    };

    const selectedModel = modelMap[body.model || 'mistral'];

    // Prepare the request to OpenRouter
    const openRouterRequest: OpenRouterRequest = {
      model: selectedModel,
      messages: body.messages,
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 0.9,
      // OpenRouter/Many models support these for repetition control
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
    };

    // Make the API call to OpenRouter
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Chatbot',
      },
      body: JSON.stringify(openRouterRequest),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter API error:', response.status, errorData);

      return NextResponse.json(
        { error: `OpenRouter API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Parse the response
    const openRouterResponse: OpenRouterResponse = await response.json();

    // Extract the assistant's message
    const assistantMessage = openRouterResponse.choices[0]?.message;

    if (!assistantMessage) {
      return NextResponse.json(
        { error: 'No response from assistant' },
        { status: 500 }
      );
    }

    // Return the response
    const chatResponse: ChatResponse = {
      message: assistantMessage,
    };

    return NextResponse.json(chatResponse);

  } catch (error) {
    console.error('Chat API error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
