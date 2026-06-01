const prisma = require('../src/config/prisma');
const { toTimeOnlyDate } = require('../src/utils/date');

async function main() {
  const teachers = await prisma.user.findMany({
    where: {
      UserRole: { some: { Role: { RoleName: 'teacher' } } },
      IsActive: true,
      DeletedAt: null,
    },
    select: { UserID: true, FirstName: true, LastName: true },
    orderBy: { UserID: 'asc' },
  });

  console.log('\nActive teachers and their APPROVED recurring availability:');
  for (const t of teachers) {
    const approved = await prisma.teacherAvailability.findMany({
      where: {
        TeacherID: t.UserID,
        TeacherAvailabilityStatus: {
          OR: [
            { StatusName: { contains: 'approved' } },
            { StatusName: { contains: 'aprovado' } },
            { StatusName: { contains: 'validated' } },
            { StatusName: { contains: 'validado' } },
          ],
        },
      },
      include: { TeacherAvailabilityRecurring: true, TeacherAvailabilityPunctual: true },
    });
    console.log(`\n#${t.UserID} ${t.FirstName} ${t.LastName || ''} -> ${approved.length} approved`);
    for (const a of approved) {
      if (a.TeacherAvailabilityRecurring) {
        const r = a.TeacherAvailabilityRecurring;
        console.log(`   recurring DOW=${r.DayOfWeek} ${r.StartTime?.toISOString().slice(11,16)}-${r.EndTime?.toISOString().slice(11,16)} active=${r.IsActive}`);
      }
      if (a.TeacherAvailabilityPunctual) {
        const p = a.TeacherAvailabilityPunctual;
        console.log(`   punctual ${p.StartDateTime?.toISOString()} -> ${p.EndDateTime?.toISOString()}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
