const prisma = require('../src/config/prisma')

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT kc.name AS constraint_name, kc.type_desc, c.name AS column_name " +
      "FROM sys.key_constraints kc " +
      "JOIN sys.index_columns ic ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id " +
      "JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id " +
      "WHERE kc.parent_object_id = OBJECT_ID('dbo.CoachingRequest') " +
      "ORDER BY kc.name, ic.key_ordinal"
  )

  const uniqueIndexes = await prisma.$queryRawUnsafe(
    "SELECT i.name AS index_name, i.is_unique, c.name AS column_name " +
      "FROM sys.indexes i " +
      "JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id " +
      "JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id " +
      "WHERE i.object_id = OBJECT_ID('dbo.CoachingRequest') AND i.is_unique = 1 " +
      "ORDER BY i.name, ic.key_ordinal"
  )

  const columns = await prisma.$queryRawUnsafe(
    "SELECT c.name AS column_name, c.is_nullable, dc.definition AS default_value " +
      "FROM sys.columns c " +
      "LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id " +
      "WHERE c.object_id = OBJECT_ID('dbo.CoachingRequest') " +
      "ORDER BY c.column_id"
  )

  console.log(JSON.stringify(rows, null, 2))
  console.log(JSON.stringify(uniqueIndexes, null, 2))
  console.log(JSON.stringify(columns, null, 2))
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
