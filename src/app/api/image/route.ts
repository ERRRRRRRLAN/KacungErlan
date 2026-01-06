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

    const visionModel = 'google/gemma-3-4b-it:free';
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

    console.log(`Using vision model: ${visionModel}`);

    const visionRequest = {
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: visionPrompt },
            { type: 'image_url', image_url: { url: body.imageUrl } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 1500
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Kacung',
      },
      body: JSON.stringify(visionRequest),
    });

    if (!response.ok) {
      const errorData = await response.text();
      const lastError = `Model ${visionModel}: ${response.status} ${errorData}`;
      console.error('Vision model failed:', lastError);
      return NextResponse.json(
        { error: `Vision model failed. Error: ${lastError}` },
        { status: 500 }
      );
    }

    const visionResponse = await response.json();
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
