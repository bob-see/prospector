import { prisma } from "@/lib/prisma";
import NavBar from "@/components/NavBar";

const PAGE_SIZE = 50;

type ContactsPageProps = {
  searchParams: Promise<{
    page?: string | string[];
  }>;
};

function getPageNumber(value: string | string[] | undefined) {
  const rawPage = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawPage || "1", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

function truncate(value: string | null) {
  if (!value) {
    return "";
  }

  return value.length > 100 ? `${value.slice(0, 100)}...` : value;
}

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: ContactsPageProps) {
  const { page } = await searchParams;
  const currentPage = getPageNumber(page);
  const skip = (currentPage - 1) * PAGE_SIZE;

  // Run Prisma queries sequentially to reduce simultaneous DB connections in development and low-connection environments.
  const contacts = await prisma.contact.findMany({
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      displayName: true,
      primaryPhone: true,
      primaryEmail: true,
      rawNotes: true,
    },
  });
  const totalContacts = await prisma.contact.count();

  const totalPages = Math.max(1, Math.ceil(totalContacts / PAGE_SIZE));

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
        <h1>Contacts</h1>

        <p>
          Page {currentPage} of {totalPages} ({totalContacts} contacts)
        </p>

        <table>
          <thead>
            <tr>
              <th>displayName</th>
              <th>primaryPhone</th>
              <th>primaryEmail</th>
              <th>rawNotes</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>{contact.displayName}</td>
                <td>{contact.primaryPhone || ""}</td>
                <td>{contact.primaryEmail || ""}</td>
                <td>{truncate(contact.rawNotes)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {contacts.length === 0 && <p>No contacts found.</p>}

        <nav>
          {currentPage > 1 && (
            <a href={`/contacts?page=${currentPage - 1}`}>Previous</a>
          )}
          {currentPage > 1 && currentPage < totalPages && " "}
          {currentPage < totalPages && (
            <a href={`/contacts?page=${currentPage + 1}`}>Next</a>
          )}
        </nav>
      </main>
    </>
  );
}
