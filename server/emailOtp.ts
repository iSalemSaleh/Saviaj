// Email OTP verification - Demo mode (no external email service required)
// In production, connect to Resend, SendGrid, or another email service

export async function sendEmailOTP(email: string, code: string): Promise<{ success: boolean; demoMode: boolean }> {
  // For now, we use demo mode where the OTP is shown directly
  // This can be replaced with actual email sending when an email service is configured
  console.log(`[Email OTP] Demo mode - OTP for ${email}: ${code}`);
  
  return { success: true, demoMode: true };
}
