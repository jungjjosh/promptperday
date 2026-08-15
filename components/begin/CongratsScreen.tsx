import styles from "./begin.module.css";

export default function CongratsScreen() {
  return (
    <div className={`${styles.screen} ${styles.centered}`}>
      <h1>Congrats!</h1>
      <p>Return tomorrow!</p>
    </div>
  );
}
