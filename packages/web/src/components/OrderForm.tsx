import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type { OrderInput, OrderSide } from "@tradeit/shared";

export type OrderFormValues = OrderInput;

interface OrderFormProps {
  symbol: string;
  userId: string;
  onSubmit: (values: OrderFormValues) => Promise<void>;
}

const initialState = (symbol: string, userId: string): OrderFormValues => ({
  userId,
  symbol,
  side: "buy",
  type: "limit",
  quantity: 1,
  price: 100,
});

export function OrderForm({ symbol, userId, onSubmit }: OrderFormProps) {
  const [values, setValues] = useState<OrderFormValues>(() => initialState(symbol, userId));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const previousSymbolRef = useRef(symbol);
  const previousUserRef = useRef(userId);

  useEffect(() => {
    if (previousSymbolRef.current !== symbol || previousUserRef.current !== userId) {
      previousSymbolRef.current = symbol;
      previousUserRef.current = userId;
      setValues((prev: OrderFormValues) => ({
        ...prev,
        symbol,
        userId,
      }));
    }
  }, [symbol, userId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(undefined);

    try {
      await onSubmit(values);
      setMessage("Order submitted successfully");
      setValues(initialState(symbol, userId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <h2>New Order</h2>
      <div className="order-form-section">
        <span className="order-form-label">Trader</span>
        <span className="order-form-badge">{values.userId}</span>
      </div>

      <label>
        Side
        <select
          value={values.side}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setValues((prev: OrderFormValues) => ({
              ...prev,
              side: event.target.value as OrderSide,
            }))
          }
        >
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
      </label>

      <label>
        Type
        <select
          value={values.type}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setValues((prev: OrderFormValues) => {
              const nextType = event.target.value as OrderFormValues["type"];
              return {
                ...prev,
                type: nextType,
                price: nextType === "market" ? undefined : prev.price ?? 0,
              };
            })
          }
        >
          <option value="limit">Limit</option>
          <option value="market">Market</option>
        </select>
      </label>

      <label>
        Quantity
        <input
          type="number"
          min={0.0001}
          step={0.0001}
          value={values.quantity}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setValues((prev: OrderFormValues) => ({
              ...prev,
              quantity: Number(event.target.value),
            }))
          }
          required
        />
      </label>

      {values.type === "limit" ? (
        <label>
          Price
          <input
            type="number"
            min={0.0001}
            step={0.0001}
            value={values.price ?? 0}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setValues((prev: OrderFormValues) => ({
                ...prev,
                price: Number(event.target.value),
              }))
            }
            required
          />
        </label>
      ) : null}

      <button className="submit" type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : `Submit ${values.side.toUpperCase()} order`}
      </button>

      {message ? <p className="form-message">{message}</p> : null}
    </form>
  );
}
