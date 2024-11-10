using Microsoft.AspNetCore.SignalR;
using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

public class VideoCallHub : Hub
{
    private readonly ILogger<VideoCallHub> _logger;

    public VideoCallHub(ILogger<VideoCallHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public async Task JoinRoom(string roomId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
        _logger.LogInformation("User {ConnectionId} joined room: {RoomId}", Context.ConnectionId, roomId);
        await Clients.Group(roomId).SendAsync("userConnected", Context.ConnectionId);
    }

    public async Task SendSignal(string signal, string roomId, string userId)
    {
        _logger.LogInformation(
            "Signal from {FromId} to {ToId} in room {RoomId}. Signal type: {SignalType}",
            Context.ConnectionId,
            userId,
            roomId,
            signal.Contains("\"type\":\"offer\"") ? "offer" :
            signal.Contains("\"type\":\"answer\"") ? "answer" :
            signal.Contains("\"type\":\"candidate\"") ? "candidate" : "unknown"
        );
        await Clients.Client(userId).SendAsync("receiveSignal", signal, Context.ConnectionId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation(
            "Client disconnected: {ConnectionId}. Reason: {Exception}",
            Context.ConnectionId,
            exception?.Message ?? "Normal disconnect"
        );
        await Clients.All.SendAsync("userDisconnected", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}