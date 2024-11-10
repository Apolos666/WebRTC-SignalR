var builder = WebApplication.CreateBuilder(args);

// Cấu hình logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

builder.Services.AddSignalR();
builder.Services.AddCors();

var app = builder.Build();

app.MapGet("/", () => "Hello World!");

app.UseCors(builder =>
{
    builder.WithOrigins(
            "http://localhost:3000",
            "https://localhost:3000",
            "http://localhost:3001",
            "https://localhost:3001",
            "https://eight-said-ericsson-sun.trycloudflare.com"
        )
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
});

app.MapHub<VideoCallHub>("/videocallhub");

app.Run();
