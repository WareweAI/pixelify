// Debug API to check what events are in the database
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Get all events with their event names
    const events = await prisma.event.findMany({
      select: {
        id: true,
        eventName: true,
        createdAt: true,
        appId: true,
        value: true,
        currency: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get unique event names
    const eventNames = await prisma.event.groupBy({
      by: ['eventName'],
      _count: true,
    });

    // Get total count
    const totalEvents = await prisma.event.count();

    return Response.json({
      totalEvents,
      eventNames: eventNames.map(e => ({ name: e.eventName, count: e._count })),
      recentEvents: events,
    });
  } catch (error) {
    console.error('Debug events error:', error);
    return Response.json({ error: 'Database error' }, { status: 500 });
  }
}

export default function DebugEventsAPI() {
  return null;
}