-- Persist certificate PDF bytes separately from metadata.
CREATE TABLE "CertificatePdf" (
    "certificateId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "CertificatePdf_pkey" PRIMARY KEY ("certificateId")
);
ALTER TABLE "CertificatePdf" ADD CONSTRAINT "CertificatePdf_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
