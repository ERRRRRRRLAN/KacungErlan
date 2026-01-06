import { NextRequest, NextResponse } from 'next/server';
import { ImageProcessingRequest, ImageDescriptionResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body: ImageProcessingRequest = await request.json();

    if (!body.imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key is not configured' },
        { status: 500 }
      );
    }

    // List of Nvidia/Google/Other vision models to try (gratis/free models only)
    const visionModels = [
      'google/gemini-2.0-flash-exp:free', // High reliability
      'google/gemma-3-27b-it:free',       // Newer Gemma 3
      'google/gemma-3-12b-it:free',
      'nvidia/nemotron-nano-12b-v2-vl:free',
      'qwen/qwen2.5-vl-72b-instruct:free',
      'moonshotai/kimi-vl-a3b-thinking:free',
    ];

    console.log(`Processing image upload. Base64 length: ${body.imageUrl.length}`);
    console.log(`API Key configured: ${apiKey ? 'Yes' : 'No'} (Length: ${apiKey?.length || 0})`);

    const visionPrompt = `Analyze this image and provide a detailed description in the following JSON format:

{
  "description": "detailed description of the image content, style, and composition",
  "objects": ["list", "of", "all", "visible", "objects", "and", "elements"],
  "colors": ["dominant", "colors", "and", "color", "palette"],
  "text_content": "any text, writing, or signage visible in the image",
  "emotions": ["emotions", "or", "mood", "conveyed", "by", "the", "image"],
  "actions": ["actions", "or", "activities", "happening", "in", "the", "image"],
  "context": "overall context, setting, and environment of the image"
}

Be extremely detailed and specific. Include lighting, perspective, quality, and any other relevant visual details. If no text is visible, set text_content to null. If no specific emotions are apparent, use empty array. Analyze every aspect of the image thoroughly.`;

    let visionModel = visionModels[0]; // Default to first option
    let lastError = '';
    let finalResponse: Response | null = null;

    // Try each Nvidia vision model until one works
    for (const model of visionModels) {
      try {
        console.log(`Trying Nvidia vision model: ${model}`);

        const visionRequest = {
          model: model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: visionPrompt },
                { type: 'image_url', image_url: { url: body.imageUrl } }
              ]
            }
          ],
          temperature: 0.1, // Low temperature for consistent descriptions
          max_tokens: 1500
        };

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            'X-Title': 'AI Image Processor',
          },
          body: JSON.stringify(visionRequest),
        });

        if (response.ok) {
          finalResponse = response;
          console.log(`Nvidia vision model ${model} worked successfully`);
          visionModel = model;
          break; // Found a working model
        } else {
          const errorData = await response.text();
          lastError = `Model ${model}: ${response.status} ${errorData}`;
          console.warn(`Nvidia vision model ${model} failed:`, lastError);
        }
      } catch (error) {
        lastError = `Model ${model}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.warn(`Nvidia vision model ${model} failed:`, lastError);
      }
    }

    if (!finalResponse || !finalResponse.ok) {
      console.error('All Nvidia vision models failed. Last error:', lastError);
      return NextResponse.json(
        { error: `All Nvidia vision models failed. Last error: ${lastError}` },
        { status: 500 }
      );
    }

    const visionResponse = await finalResponse.json();
    const description = visionResponse.choices[0]?.message?.content;

    if (!description) {
      return NextResponse.json(
        { error: 'Failed to get image description' },
        { status: 500 }
      );
    }

    // Parse JSON response
    try {
      const parsedDescription: ImageDescriptionResponse = JSON.parse(description);
      return NextResponse.json({ description: parsedDescription });
    } catch (parseError) {
      // Fallback jika response bukan JSON valid - buat struktur JSON manual
      console.log('Vision model response:', description);

      const fallbackDescription: ImageDescriptionResponse = {
        description: description,
        objects: [],
        colors: [],
        context: 'Image description from vision model'
      };

      return NextResponse.json({ description: fallbackDescription });
    }

  } catch (error) {
    console.error('Image processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
