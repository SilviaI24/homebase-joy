GRANT SELECT ON operations TO authenticated;

CREATE POLICY "staff ve operations"
ON operations
FOR SELECT
TO authenticated
USING (es_staff_crm());
