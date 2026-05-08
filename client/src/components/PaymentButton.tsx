import { useState, useEffect } from "react";
import { loadStripe, PaymentRequest } from "@stripe/stripe-js";
import { Elements, PaymentRequestButtonElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Wallet } from "lucide-react";
import { formatMoneyMajor } from "@shared/money";

interface PaymentButtonProps {
  amount: number;
  rideId: number;
  onSuccess: () => void;
  onError: (error: string) => void;
}

// Payment is currently GBP-only end-to-end:
//   server/stripeService.ts createPaymentIntent + checkout sessions
//   both hardcode `currency: 'gbp'`.
// Until those derive currency from the ride/driver, the wallet sheet
// and the displayed "Pay …" amount must stay in GBP so the user
// isn't shown one currency and charged in another. Switching the
// client side without the server side is a correctness bug, so we
// deliberately keep both halves in lockstep here. When the backend
// becomes currency-aware, swap this back to `useUserMoneyFormatter`.
const PAYMENT_CURRENCY = 'gbp';
const PAYMENT_COUNTRY = 'GB';

async function confirmPaymentWithBackend(rideId: number, paymentIntentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/rides/${rideId}/confirm-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentIntentId }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.message || "Failed to confirm payment" };
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error confirming payment with backend:", error);
    return { success: false, error: "Network error confirming payment" };
  }
}

function PaymentRequestButton({ amount, rideId, onSuccess, onError }: PaymentButtonProps) {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canMakePayment, setCanMakePayment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!stripe) return;

    const pr = stripe.paymentRequest({
      country: PAYMENT_COUNTRY,
      currency: PAYMENT_CURRENCY,
      total: {
        label: "AtlasRide - Ride Payment",
        amount: Math.round(amount * 100),
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        setCanMakePayment(true);
        setPaymentRequest(pr);
      }
    });

    pr.on("paymentmethod", async (event) => {
      setIsProcessing(true);
      try {
        const response = await fetch(`/api/rides/${rideId}/create-payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        
        const { clientSecret, paymentIntentId, error: serverError } = await response.json();
        
        if (serverError) {
          event.complete("fail");
          onError(serverError);
          return;
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: event.paymentMethod.id },
          { handleActions: false }
        );

        if (error) {
          event.complete("fail");
          onError(error.message || "Payment failed");
        } else {
          event.complete("success");
          
          let finalPaymentIntentId = paymentIntent.id;
          
          if (paymentIntent.status === "requires_action") {
            const { error: actionError, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(clientSecret);
            if (actionError) {
              onError(actionError.message || "Payment verification failed");
              return;
            }
            finalPaymentIntentId = confirmedIntent?.id || paymentIntent.id;
          }
          
          const confirmResult = await confirmPaymentWithBackend(rideId, finalPaymentIntentId);
          if (confirmResult.success) {
            onSuccess();
          } else {
            onError(confirmResult.error || "Failed to confirm payment with server");
          }
        }
      } catch (err) {
        event.complete("fail");
        onError("Payment processing failed");
      } finally {
        setIsProcessing(false);
      }
    });
  }, [stripe, amount, rideId, onSuccess, onError]);

  const handleCardPayment = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/rides/${rideId}/payment-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      const { url, error } = await response.json();
      
      if (error) {
        onError(error);
        return;
      }
      
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      onError("Failed to start payment");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      {canMakePayment && paymentRequest && (
        <div className="space-y-2">
          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
            <Wallet className="h-3 w-3" />
            Pay with Google Pay or Apple Pay
          </p>
          <PaymentRequestButtonElement
            options={{
              paymentRequest,
              style: {
                paymentRequestButton: {
                  type: "default",
                  theme: "dark",
                  height: "48px",
                },
              },
            }}
          />
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>
        </div>
      )}
      
      <Button
        onClick={handleCardPayment}
        className="w-full h-12"
        disabled={isProcessing}
        data-testid="button-card-payment"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay {formatMoneyMajor(amount, PAYMENT_CURRENCY)} with Card
          </>
        )}
      </Button>
    </div>
  );
}

let stripePromise: ReturnType<typeof loadStripe> | null = null;

async function getStripe() {
  if (!stripePromise) {
    const response = await fetch("/api/stripe/publishable-key");
    const { publishableKey } = await response.json();
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

export default function PaymentButton(props: PaymentButtonProps) {
  const [stripe, setStripe] = useState<Awaited<ReturnType<typeof loadStripe>> | null>(null);

  useEffect(() => {
    getStripe().then(setStripe);
  }, []);

  if (!stripe) {
    return (
      <Button className="w-full h-12" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading payment...
      </Button>
    );
  }

  return (
    <Elements stripe={stripe}>
      <PaymentRequestButton {...props} />
    </Elements>
  );
}
