import VideoCall from "@/components/VideoCall";

export default function RoomPage({ params }: { params: { roomId: string } }) {
  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-2xl font-bold mb-8">Room: {params.roomId}</h1>
      <VideoCall roomId={params.roomId} />
    </div>
  );
}
