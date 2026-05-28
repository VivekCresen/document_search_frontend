import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html'
})
export class Register {
  userName = signal('');
  fullName = signal('');
  email    = signal('');
  password = signal('');
  confirm  = signal('');
  error    = signal('');
  success  = signal('');
  loading  = signal(false);

  // Validation signals
  userNameError = signal('');
  fullNameError = signal('');
  emailError    = signal('');
  passwordError = signal('');
  confirmError  = signal('');

  constructor(private router: Router, private api: ApiService) {}

  onUsernameChange(val: string) {
    this.userName.set(val);
    if (this.userNameError()) {
      this.validate();
    }
  }

  onFullNameChange(val: string) {
    this.fullName.set(val);
    if (this.fullNameError()) {
      this.validate();
    }
  }

  onEmailChange(val: string) {
    this.email.set(val);
    if (this.emailError()) {
      this.validate();
    }
  }

  onPasswordChange(val: string) {
    this.password.set(val);
    if (this.passwordError()) {
      this.validate();
    }
  }

  onConfirmChange(val: string) {
    this.confirm.set(val);
    if (this.confirmError()) {
      this.validate();
    }
  }

  validate(): boolean {
    let isValid = true;

    // Username checks
    const usernameVal = this.userName().trim();
    if (!usernameVal) {
      this.userNameError.set('Username is required.');
      isValid = false;
    } else if (usernameVal.length < 3) {
      this.userNameError.set('Username must be at least 3 characters.');
      isValid = false;
    } else if (!/^[a-zA-Z0-9_-]+$/.test(usernameVal)) {
      this.userNameError.set('Username can only contain letters, numbers, hyphens, and underscores.');
      isValid = false;
    } else {
      this.userNameError.set('');
    }

    // Full Name checks
    const fullNameVal = this.fullName().trim();
    if (!fullNameVal) {
      this.fullNameError.set('Full Name is required.');
      isValid = false;
    } else if (fullNameVal.length < 2) {
      this.fullNameError.set('Full Name must be at least 2 characters.');
      isValid = false;
    } else {
      this.fullNameError.set('');
    }

    // Email checks
    const emailVal = this.email().trim();
    if (!emailVal) {
      this.emailError.set('Email is required.');
      isValid = false;
    } else {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
      if (!emailRegex.test(emailVal)) {
        this.emailError.set('Please enter a valid email address.');
        isValid = false;
      } else {
        this.emailError.set('');
      }
    }

    // Password checks
    const passwordVal = this.password();
    if (!passwordVal) {
      this.passwordError.set('Password is required.');
      isValid = false;
    } else if (passwordVal.length < 6) {
      this.passwordError.set('Password must be at least 6 characters.');
      isValid = false;
    } else if (!/[A-Za-z]/.test(passwordVal) || !/[0-9]/.test(passwordVal)) {
      this.passwordError.set('Password must contain both letters and numbers.');
      isValid = false;
    } else {
      this.passwordError.set('');
    }

    // Confirm Password checks
    if (!this.confirm()) {
      this.confirmError.set('Please confirm your password.');
      isValid = false;
    } else if (this.confirm() !== this.password()) {
      this.confirmError.set('Passwords do not match.');
      isValid = false;
    } else {
      this.confirmError.set('');
    }

    return isValid;
  }

  register() {
    if (!this.validate()) {
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.api.register({ userName: this.userName().trim(), fullName: this.fullName().trim(), email: this.email().trim(), password: this.password() }).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Account created! Redirecting to login…');
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.loading.set(false);
        console.error('Register error:', err);
        const msg = err.error?.message ?? err.error?.error ?? err.message ?? 'Registration failed. Please try again.';
        this.error.set(msg);
      }
    });
  }
}
