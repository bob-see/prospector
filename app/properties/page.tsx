import { prisma } from "@/lib/prisma";
import NavBar from "@/components/NavBar";

const PAGE_SIZE = 50;

type PropertiesPageProps = {
  searchParams: Promise<{
    page?: string | string[];
  }>;
};

function getPageNumber(value: string | string[] | undefined) {
  const rawPage = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawPage || "1", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: PropertiesPageProps) {
  const { page } = await searchParams;
  const currentPage = getPageNumber(page);
  const skip = (currentPage - 1) * PAGE_SIZE;

  // Run Prisma queries sequentially to reduce simultaneous DB connections in development and low-connection environments.
  const properties = await prisma.contactProperty.findMany({
    orderBy: {
      id: "asc",
    },
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      addressRaw: true,
      streetNumber: true,
      streetName: true,
      suburb: true,
      relationshipType: true,
      confidenceScore: true,
      contact: {
        select: {
          displayName: true,
        },
      },
    },
  });
  const totalProperties = await prisma.contactProperty.count();

  const totalPages = Math.max(1, Math.ceil(totalProperties / PAGE_SIZE));

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
        <h1>Properties</h1>

        <p>
          Page {currentPage} of {totalPages} ({totalProperties} properties)
        </p>

        <table>
          <thead>
            <tr>
              <th>displayName</th>
              <th>addressRaw</th>
              <th>streetNumber</th>
              <th>streetName</th>
              <th>suburb</th>
              <th>relationshipType</th>
              <th>confidenceScore</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((property) => (
              <tr key={property.id}>
                <td>{property.contact.displayName}</td>
                <td>{property.addressRaw}</td>
                <td>{property.streetNumber || ""}</td>
                <td>{property.streetName || ""}</td>
                <td>{property.suburb || ""}</td>
                <td>{property.relationshipType || ""}</td>
                <td>{property.confidenceScore ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {properties.length === 0 && <p>No properties found.</p>}

        <nav>
          {currentPage > 1 && (
            <a href={`/properties?page=${currentPage - 1}`}>Previous</a>
          )}
          {currentPage > 1 && currentPage < totalPages && " "}
          {currentPage < totalPages && (
            <a href={`/properties?page=${currentPage + 1}`}>Next</a>
          )}
        </nav>
      </main>
    </>
  );
}
