using Microsoft.AspNetCore.Mvc;

namespace Data_Migration_Ai_Backend.Controllers
{
    public class Login : Controller
    {
        [HttpGet]
        public string Get()
        {
            return "API Working";
        }
    }
}
