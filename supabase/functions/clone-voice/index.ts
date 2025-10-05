import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VoiceCloneRequest {
  audioBlob: string;
  name: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");

    if (!elevenlabsApiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured", success: false }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { audioBlob, name } = await req.json() as VoiceCloneRequest;

    if (!audioBlob || !name) {
      return new Response(
        JSON.stringify({ error: "Missing audioBlob or name" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const audioBuffer = Uint8Array.from(atob(audioBlob), c => c.charCodeAt(0));

    const formData = new FormData();
    formData.append("name", name);
    formData.append("files", new Blob([audioBuffer], { type: "audio/webm" }), "audio.webm");

    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: {
        "xi-api-key": elevenlabsApiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({
        voiceId: result.voice_id,
        success: true
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error cloning voice:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        success: false
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
