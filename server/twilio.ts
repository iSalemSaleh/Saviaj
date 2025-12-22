// Twilio integration for SMS verification
import twilio from 'twilio';

function getCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error('Twilio not connected');
  }
  
  return {
    accountSid,
    authToken,
    messagingServiceSid
  };
}

export async function getTwilioClient() {
  const { accountSid, authToken } = getCredentials();
  return twilio(accountSid, authToken);
}

export function getMessagingServiceSid() {
  const { messagingServiceSid } = getCredentials();
  return messagingServiceSid;
}

export async function sendVerificationSMS(toPhoneNumber: string, code: string): Promise<boolean> {
  try {
    const client = await getTwilioClient();
    const messagingServiceSid = getMessagingServiceSid();
    
    console.log(`[Twilio] Attempting to send SMS to ${toPhoneNumber} using Messaging Service`);
    
    const message = await client.messages.create({
      body: `Your AtlasRide verification code is: ${code}. This code expires in 5 minutes.`,
      messagingServiceSid: messagingServiceSid,
      to: toPhoneNumber
    });
    
    console.log(`[Twilio] SMS sent successfully to ${toPhoneNumber}, SID: ${message.sid}`);
    return true;
  } catch (error: any) {
    console.error('[Twilio] Failed to send SMS:', {
      to: toPhoneNumber,
      errorCode: error.code,
      errorMessage: error.message,
      moreInfo: error.moreInfo,
      status: error.status
    });
    return false;
  }
}
