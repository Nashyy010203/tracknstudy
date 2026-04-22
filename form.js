const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');

if (registerBtn) {
    registerBtn.addEventListener('click', () => {
        container.classList.add("active");
    });
}

if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        container.classList.remove("active");
    });
}

// Auto-capitalize name input
const nameInputs = document.querySelectorAll('input[type="text"]');
nameInputs.forEach(input => {
    input.setAttribute('maxlength', '20');
    input.addEventListener('input', (e) => {
        let value = e.target.value;
        value = value.replace(/\b\w/g, char => char.toUpperCase());
        e.target.value = value;
    });
});

// Limit email input
const emailInputs = document.querySelectorAll('input[type="email"]');
emailInputs.forEach(input => {
    input.setAttribute('maxlength', '20');
});

// Password validation
const passwordInputs = document.querySelectorAll('input[type="password"]');
passwordInputs.forEach(input => {
    input.setAttribute('minlength', '8');
    input.setAttribute('maxlength', '20');
});

// Social icon alert
document.querySelectorAll('.social-icons a').forEach(icon => {
    icon.addEventListener('click', (e) => {
        e.preventDefault();
        alert("Log in successfully");
    });
});

// Sign Up logic
const signUpForm = document.querySelector('.sign-up form');
signUpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = signUpForm.querySelector('input[type="text"]').value.trim();
    const email = signUpForm.querySelector('input[type="email"]').value.trim();
    const password = signUpForm.querySelector('input[type="password"]').value;

    if (name && email && password.length >= 8 && password.length <= 20) {
        localStorage.setItem('userName', name);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userPassword', password);
        alert("Account created successfully!");
        container.classList.remove("active"); // Switch to sign-in
    } else {
        alert("Please fill out all fields correctly.");
    }
});

// Sign In logic
const signInForm = document.querySelector('.sign-in form');
signInForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = signInForm.querySelector('input[type="email"]').value.trim();
    const password = signInForm.querySelector('input[type="password"]').value;

    const storedEmail = localStorage.getItem('userEmail');
    const storedPassword = localStorage.getItem('userPassword');
    const storedName = localStorage.getItem('userName');

    if (email === storedEmail && password === storedPassword) {
        alert(`Welcome ${storedName}`);
        window.location.href = "index.html";
    } else {
        alert("Invalid credentials");
    }
});

