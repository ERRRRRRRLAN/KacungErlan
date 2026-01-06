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

    // Use Gemini API Key provided by user
    // Recommendation: Set this as GEMINI_API_KEY in Vercel Environment Variables
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBU-fGc-MYuKudiAf8uD2AiQKWEQ6Tpeh4';
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    console.log(`Processing image upload with Gemini. Base64 length: ${body.imageUrl.length}`);

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

    // Process base64 image data
    let mimeType = 'image/jpeg';
    let base64Data = body.imageUrl;

    if (body.imageUrl.startsWith('data:')) {
      const match = body.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    const visionRequest = {
      contents: [
        {
          parts: [
            { text: visionPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(visionRequest),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini vision model failed:', response.status, errorData);
      return NextResponse.json(
        { error: `Gemini vision model failed with status ${response.status}` },
        { status: 500 }
      );
    }

    const visionResult = await response.json();
    const description = visionResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!description) {
      return NextResponse.json(
        { error: 'Failed to get image description from Gemini' },
        { status: 500 }
      );
    }

    // Parse JSON response
    try {
      const parsedDescription: ImageDescriptionResponse = JSON.parse(description);
      return NextResponse.json({ description: parsedDescription });
    } catch (parseError) {
      console.log('Gemini model non-JSON response:', description);

      const fallbackDescription: ImageDescriptionResponse = {
        description: description,
        objects: [],
        colors: [],
        context: 'Image description from Gemini'
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
