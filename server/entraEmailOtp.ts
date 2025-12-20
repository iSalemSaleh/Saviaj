// Microsoft Entra External ID Native Authentication - Email OTP
// Uses Microsoft's built-in email service to send OTP codes

const TENANT_NAME = "atlasridecustomers";
const TENANT_DOMAIN = `${TENANT_NAME}.onmicrosoft.com`;
const CIAM_ENDPOINT = `https://${TENANT_NAME}.ciamlogin.com`;

interface SignUpStartResponse {
  continuation_token?: string;
  challenge_type?: string;
  error?: string;
  error_description?: string;
}

interface ChallengeResponse {
  continuation_token?: string;
  challenge_target_label?: string;
  code_length?: number;
  binding_method?: string;
  interval?: number;
  error?: string;
  error_description?: string;
}

interface ContinueResponse {
  continuation_token?: string;
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
  suberror?: string;
}

export async function initiateEmailOtpSignUp(email: string): Promise<{ 
  success: boolean; 
  continuationToken?: string;
  challengeTargetLabel?: string;
  codeLength?: number;
  error?: string;
}> {
  const clientId = process.env.ENTRA_CLIENT_ID;
  
  if (!clientId) {
    return { success: false, error: "Entra ID not configured" };
  }

  try {
    // Step 1: Start the sign-up flow
    const startResponse = await fetch(`${CIAM_ENDPOINT}/${TENANT_DOMAIN}/signup/v1.0/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        username: email,
        challenge_type: 'oob redirect',
      }).toString(),
    });

    const startData: SignUpStartResponse = await startResponse.json();
    console.log('[Entra] Sign-up start response:', JSON.stringify(startData, null, 2));

    if (startData.error) {
      // If user already exists, try sign-in flow instead
      if (startData.error === 'user_already_exists') {
        return initiateEmailOtpSignIn(email);
      }
      return { success: false, error: startData.error_description || startData.error };
    }

    if (!startData.continuation_token) {
      return { success: false, error: "No continuation token received" };
    }

    // Step 2: Request the OTP challenge
    const challengeResponse = await fetch(`${CIAM_ENDPOINT}/${TENANT_DOMAIN}/signup/v1.0/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        continuation_token: startData.continuation_token,
        challenge_type: 'oob',
      }).toString(),
    });

    const challengeData: ChallengeResponse = await challengeResponse.json();
    console.log('[Entra] Challenge response:', JSON.stringify(challengeData, null, 2));

    if (challengeData.error) {
      return { success: false, error: challengeData.error_description || challengeData.error };
    }

    return {
      success: true,
      continuationToken: challengeData.continuation_token,
      challengeTargetLabel: challengeData.challenge_target_label,
      codeLength: challengeData.code_length || 8,
    };
  } catch (error: any) {
    console.error('[Entra] Email OTP initiation error:', error);
    return { success: false, error: error.message || "Failed to send verification code" };
  }
}

export async function initiateEmailOtpSignIn(email: string): Promise<{ 
  success: boolean; 
  continuationToken?: string;
  challengeTargetLabel?: string;
  codeLength?: number;
  error?: string;
}> {
  const clientId = process.env.ENTRA_CLIENT_ID;
  
  if (!clientId) {
    return { success: false, error: "Entra ID not configured" };
  }

  try {
    // Step 1: Start the sign-in flow
    const startResponse = await fetch(`${CIAM_ENDPOINT}/${TENANT_DOMAIN}/signin/v1.0/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        username: email,
        challenge_type: 'oob redirect',
      }).toString(),
    });

    const startData: SignUpStartResponse = await startResponse.json();
    console.log('[Entra] Sign-in start response:', JSON.stringify(startData, null, 2));

    if (startData.error) {
      return { success: false, error: startData.error_description || startData.error };
    }

    if (!startData.continuation_token) {
      return { success: false, error: "No continuation token received" };
    }

    // Step 2: Request the OTP challenge
    const challengeResponse = await fetch(`${CIAM_ENDPOINT}/${TENANT_DOMAIN}/signin/v1.0/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        continuation_token: startData.continuation_token,
        challenge_type: 'oob',
      }).toString(),
    });

    const challengeData: ChallengeResponse = await challengeResponse.json();
    console.log('[Entra] Sign-in challenge response:', JSON.stringify(challengeData, null, 2));

    if (challengeData.error) {
      return { success: false, error: challengeData.error_description || challengeData.error };
    }

    return {
      success: true,
      continuationToken: challengeData.continuation_token,
      challengeTargetLabel: challengeData.challenge_target_label,
      codeLength: challengeData.code_length || 8,
    };
  } catch (error: any) {
    console.error('[Entra] Sign-in OTP initiation error:', error);
    return { success: false, error: error.message || "Failed to send verification code" };
  }
}

export async function verifyEmailOtp(continuationToken: string, otpCode: string, isSignUp: boolean = true): Promise<{
  success: boolean;
  verified: boolean;
  continuationToken?: string;
  accessToken?: string;
  error?: string;
}> {
  const clientId = process.env.ENTRA_CLIENT_ID;
  
  if (!clientId) {
    return { success: false, verified: false, error: "Entra ID not configured" };
  }

  try {
    const endpoint = isSignUp ? 'signup' : 'signin';
    const continueResponse = await fetch(`${CIAM_ENDPOINT}/${TENANT_DOMAIN}/${endpoint}/v1.0/continue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        continuation_token: continuationToken,
        grant_type: 'oob',
        oob: otpCode,
      }).toString(),
    });

    const continueData: ContinueResponse = await continueResponse.json();
    console.log('[Entra] Continue response:', JSON.stringify(continueData, null, 2));

    if (continueData.error) {
      // Check for invalid OTP
      if (continueData.suberror === 'invalid_oob_value') {
        return { success: true, verified: false, error: "Invalid code. Please try again." };
      }
      return { success: false, verified: false, error: continueData.error_description || continueData.error };
    }

    // For sign-up, we might get a continuation token for more steps
    // For sign-in, we get access tokens
    return {
      success: true,
      verified: true,
      continuationToken: continueData.continuation_token,
      accessToken: continueData.access_token,
    };
  } catch (error: any) {
    console.error('[Entra] OTP verification error:', error);
    return { success: false, verified: false, error: error.message || "Failed to verify code" };
  }
}
