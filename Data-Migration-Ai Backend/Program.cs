var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ✅ Always enable Swagger
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.RoutePrefix = ""; // open at root
});

app.UseHttpsRedirection();
app.UseAuthorization();

app.MapControllers();

app.Run();