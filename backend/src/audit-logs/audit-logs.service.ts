const { userId, ...restData } = data;

return this.prisma.auditLog.create({
  data: {
    ...restData,
    createdAt: new Date(),
    // Only connect the user if a userId was actually provided
    ...(userId ? { user: { connect: { id: userId } } } : {})
  }
});