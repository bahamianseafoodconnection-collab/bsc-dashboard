"use client";

import SupplierChatModule from "@/components/suppliers/SupplierChatModule";

export default function Page() {
  return (
    <main style={{ padding: 20 }}>
      
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>
        BSC Control Dashboard
      </h1>

      {/* EXISTING DASHBOARD PLACEHOLDER */}
      <div style={{ marginBottom: 30 }}>
        <p>Dashboard modules will appear here...</p>
      </div>

      {/* SUPPLIER CHAT MODULE */}
      <SupplierChatModule
        currentRole="admin"
        currentUserName="Dedrick"
        suppliers={[
          {
            id: "1",
            businessName: "Tropic Seafood",
            ceoName: "John Doe",
            contactPerson: "Manager A",
            isActive: true,
          },
          {
            id: "2",
            businessName: "Promocean Ltd",
            ceoName: "Jane Smith",
            contactPerson: "Manager B",
            isActive: true,
          },
        ]}
        threads={[
          {
            id: "t1",
            supplierId: "1",
            subject: "Order for tomorrow",
            status: "open",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessagePreview: "Prepare 20 cases salmon",
          },
        ]}
        messages={[
          {
            id: "m1",
            threadId: "t1",
            senderRole: "admin",
            senderName: "Dedrick",
            body: "Please prepare 20 cases of salmon for tomorrow morning.",
            createdAt: new Date().toISOString(),
          },
        ]}
      />

    </main>
  );
}