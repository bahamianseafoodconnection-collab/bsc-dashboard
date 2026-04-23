"use client";

import { useEffect, useMemo, useState } from "react";

type UserRole = "admin" | "manager" | "supplier" | "cashier" | "customer";

type SupplierProfile = {
  id: string;
  businessName: string;
  ceoName: string;
  contactPerson: string;
  phone?: string;
  email?: string;
  isActive: boolean;
};

type ChatThread = {
  id: string;
  supplierId: string;
  subject: string;
  status: "open" | "pending" | "resolved";
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
};

type ChatMessage = {
  id: string;
  threadId: string;
  senderRole: "admin" | "manager" | "supplier";
  senderName: string;
  body: string;
  createdAt: string;
};

type SupplierChatModuleProps = {
  currentRole: UserRole;
  currentUserName: string;
  suppliers: SupplierProfile[];
  threads: ChatThread[];
  messages: ChatMessage[];
  onCreateThread?: (input: {
    supplierId: string;
    subject: string;
    body: string;
  }) => Promise<void> | void;
  onSendMessage?: (input: {
    threadId: string;
    body: string;
  }) => Promise<void> | void;
  onResolveThread?: (threadId: string) => Promise<void> | void;
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-BS", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function roleLabel(role: "admin" | "manager" | "supplier") {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "Supplier";
}

export default function SupplierChatModule({
  currentRole,
  currentUserName,
  suppliers,
  threads,
  messages,
  onCreateThread,
  onSendMessage,
  onResolveThread,
}: SupplierChatModuleProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    suppliers[0]?.id ?? ""
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string>(
    threads[0]?.id ?? ""
  );
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [search, setSearch] = useState("");
  const [isSubmittingThread, setIsSubmittingThread] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [error, setError] = useState("");

  const isAdminSide = currentRole === "admin" || currentRole === "manager";
  const isSupplierSide = currentRole === "supplier";

  const isAllowedRole = isAdminSide || isSupplierSide;

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  useEffect(() => {
    if (!selectedSupplierId && suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [selectedSupplierId, suppliers]);

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;

    return suppliers.filter((supplier) => {
      return (
        supplier.businessName.toLowerCase().includes(term) ||
        supplier.ceoName.toLowerCase().includes(term) ||
        supplier.contactPerson.toLowerCase().includes(term)
      );
    });
  }, [suppliers, search]);

  const visibleThreads = useMemo(() => {
    if (!selectedSupplierId) return threads;
    return threads
      .filter((thread) => thread.supplierId === selectedSupplierId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }, [threads, selectedSupplierId]);

  const activeThread =
    visibleThreads.find((thread) => thread.id === selectedThreadId) ??
    visibleThreads[0] ??
    null;

  const activeSupplier = suppliers.find(
    (supplier) => supplier.id === (activeThread?.supplierId || selectedSupplierId)
  );

  const activeMessages = useMemo(() => {
    if (!activeThread) return [];
    return messages
      .filter((message) => message.threadId === activeThread.id)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  }, [activeThread, messages]);

  async function handleCreateThread() {
    setError("");

    if (!isAdminSide) {
      setError("Only BSC admin or manager can create supplier chat threads.");
      return;
    }

    if (!selectedSupplierId) {
      setError("Select a supplier first.");
      return;
    }

    if (!newSubject.trim()) {
      setError("Enter a subject.");
      return;
    }

    if (!newMessage.trim()) {
      setError("Enter the first message.");
      return;
    }

    try {
      setIsSubmittingThread(true);
      await onCreateThread?.({
        supplierId: selectedSupplierId,
        subject: newSubject.trim(),
        body: newMessage.trim(),
      });
      setNewSubject("");
      setNewMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create supplier thread."
      );
    } finally {
      setIsSubmittingThread(false);
    }
  }

  async function handleReply() {
    setError("");

    if (!isAllowedRole) {
      setError("This role is not allowed to use supplier chat.");
      return;
    }

    if (!activeThread) {
      setError("Select a thread first.");
      return;
    }

    if (!replyBody.trim()) {
      setError("Enter a message.");
      return;
    }

    try {
      setIsSubmittingReply(true);
      await onSendMessage?.({
        threadId: activeThread.id,
        body: replyBody.trim(),
      });
      setReplyBody("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send the message."
      );
    } finally {
      setIsSubmittingReply(false);
    }
  }

  async function handleResolveThread() {
    setError("");

    if (!isAdminSide) {
      setError("Only BSC admin or manager can resolve supplier threads.");
      return;
    }

    if (!activeThread) {
      setError("Select a thread first.");
      return;
    }

    try {
      await onResolveThread?.(activeThread.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not resolve the thread."
      );
    }
  }

  if (!isAllowedRole) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Access denied. Supplier chat is only for BSC Admin, BSC Manager, and
        Supplier users. Cashiers and customers must never access this chat.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">Supplier Chat Control</h2>
        <p className="mt-1 text-sm text-gray-600">
          Suppliers can chat only with BSC Admin or Manager. Suppliers must
          never chat with customers or cashiers.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Search Supplier
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Business, CEO, or contact person"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-black"
            />

            <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto">
              {filteredSuppliers.map((supplier) => {
                const selected = supplier.id === selectedSupplierId;
                return (
                  <button
                    key={supplier.id}
                    type="button"
                    onClick={() => {
                      setSelectedSupplierId(supplier.id);
                      const firstThread = threads.find(
                        (thread) => thread.supplierId === supplier.id
                      );
                      setSelectedThreadId(firstThread?.id ?? "");
                    }}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selected
                        ? "border-black bg-gray-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-sm font-semibold">
                      {supplier.businessName}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      CEO: {supplier.ceoName}
                    </div>
                    <div className="text-xs text-gray-600">
                      Contact: {supplier.contactPerson}
                    </div>
                    <div className="mt-2 text-[11px] font-medium">
                      {supplier.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredSuppliers.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-gray-500">
                  No suppliers found.
                </div>
              ) : null}
            </div>
          </div>

          {isAdminSide ? (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold">New Supplier Thread</h3>

              <label className="mt-3 block text-sm font-medium text-gray-700">
                Supplier
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-black"
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.businessName}
                  </option>
                ))}
              </select>

              <label className="mt-3 block text-sm font-medium text-gray-700">
                Subject
              </label>
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Example: Order prep for tomorrow morning"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-black"
              />

              <label className="mt-3 block text-sm font-medium text-gray-700">
                First message
              </label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={4}
                placeholder="Type the first admin message here"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-black"
              />

              <button
                type="button"
                onClick={handleCreateThread}
                disabled={isSubmittingThread}
                className="mt-3 w-full rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSubmittingThread ? "Creating..." : "Create Thread"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Supplier Threads</h3>
                <p className="text-sm text-gray-600">
                  Open communication only between supplier and BSC admin side.
                </p>
              </div>

              {activeSupplier ? (
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                  <div className="font-semibold">{activeSupplier.businessName}</div>
                  <div className="text-gray-600">CEO: {activeSupplier.ceoName}</div>
                  <div className="text-gray-600">
                    Contact: {activeSupplier.contactPerson}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[280px_1fr]">
              <div className="max-h-[520px] space-y-2 overflow-y-auto rounded-2xl border p-2">
                {visibleThreads.map((thread) => {
                  const selected = thread.id === activeThread?.id;

                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        selected
                          ? "border-black bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold">{thread.subject}</div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                            thread.status === "open"
                              ? "bg-green-100 text-green-700"
                              : thread.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {thread.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Updated {formatDate(thread.updatedAt)}
                      </div>
                      {thread.lastMessagePreview ? (
                        <div className="mt-2 line-clamp-2 text-xs text-gray-600">
                          {thread.lastMessagePreview}
                        </div>
                      ) : null}
                    </button>
                  );
                })}

                {visibleThreads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-gray-500">
                    No threads for this supplier yet.
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border p-4">
                {activeThread ? (
                  <>
                    <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-semibold">
                          {activeThread.subject}
                        </div>
                        <div className="text-sm text-gray-600">
                          Thread status: {activeThread.status}
                        </div>
                      </div>

                      {isAdminSide ? (
                        <button
                          type="button"
                          onClick={handleResolveThread}
                          className="rounded-xl border px-4 py-2 text-sm font-medium"
                        >
                          Mark Resolved
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto">
                      {activeMessages.map((message) => {
                        const mine =
                          (isSupplierSide && message.senderRole === "supplier") ||
                          (isAdminSide &&
                            (message.senderRole === "admin" ||
                              message.senderRole === "manager"));

                        return (
                          <div
                            key={message.id}
                            className={`flex ${mine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                                mine
                                  ? "bg-black text-white"
                                  : "bg-gray-100 text-gray-900"
                              }`}
                            >
                              <div className="mb-1 text-xs font-semibold opacity-80">
                                {message.senderName} · {roleLabel(message.senderRole)}
                              </div>
                              <div className="whitespace-pre-wrap">{message.body}</div>
                              <div className="mt-2 text-[11px] opacity-70">
                                {formatDate(message.createdAt)}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {activeMessages.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-4 text-sm text-gray-500">
                          No messages in this thread yet.
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 border-t pt-4">
                      <div className="mb-2 text-sm font-medium text-gray-700">
                        Reply as {currentUserName}
                      </div>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={4}
                        placeholder="Type your message"
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-black"
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={handleReply}
                          disabled={isSubmittingReply}
                          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {isSubmittingReply ? "Sending..." : "Send Message"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed text-sm text-gray-500">
                    Select a supplier thread to start.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold">Locked Communication Rules</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li>• Suppliers can only chat with BSC Admin or Manager.</li>
              <li>• Suppliers must never chat with customers.</li>
              <li>• Suppliers must never chat with cashiers.</li>
              <li>• Supplier profile is identified by business, CEO, and contact person.</li>
              <li>• Customer and supplier separation must stay protected at all times.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}