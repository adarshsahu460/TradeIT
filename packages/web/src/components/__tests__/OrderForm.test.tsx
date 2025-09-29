import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { OrderForm } from "../OrderForm";

describe("OrderForm", () => {
  const symbol = "AAPL";

  it("renders limit price input and hides it for market orders", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    await act(async () => {
      render(<OrderForm symbol={symbol} onSubmit={onSubmit} />);
    });
    await screen.findByRole("heading", { name: /new order/i });

    const priceInput = screen.getByLabelText(/price/i);
    expect(priceInput).toBeInTheDocument();

    await act(async () => {
      await user.selectOptions(screen.getByLabelText(/type/i), "market");
    });

    await waitFor(() => expect(screen.queryByLabelText(/price/i)).not.toBeInTheDocument());

    await act(async () => {
      await user.selectOptions(screen.getByLabelText(/type/i), "limit");
    });

    await waitFor(() => expect(screen.getByLabelText(/price/i)).toBeInTheDocument());
  });

  it("submits values and shows success message", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    await act(async () => {
      render(<OrderForm symbol={symbol} onSubmit={onSubmit} />);
    });
    await screen.findByRole("heading", { name: /new order/i });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /submit buy order/i }));
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      symbol,
      side: "buy",
      type: "limit",
    });

    expect(await screen.findByText(/order submitted successfully/i)).toBeInTheDocument();
  });

  it("shows error message when submission fails", async () => {
    const error = new Error("Engine offline");
    const onSubmit = vi.fn().mockRejectedValue(error);
    const user = userEvent.setup();

    await act(async () => {
      render(<OrderForm symbol={symbol} onSubmit={onSubmit} />);
    });
    await screen.findByRole("heading", { name: /new order/i });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /submit buy order/i }));
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(error.message)).toBeInTheDocument();
  });
});
